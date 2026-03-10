import '~/lib/load-env'
import Stripe from 'stripe'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '~/lib/db'
import { conversions, payments } from '~/lib/db/schema'
import { createChildLogger } from '~/lib/logger'
import { enqueueJob } from '~/lib/queue'

const stripeLogger = createChildLogger({ component: 'stripe' })
const stripeSecretKey = process.env.STRIPE_SECRET_KEY
if (!stripeSecretKey) {
  stripeLogger.warn('STRIPE_SECRET_KEY is not set. Stripe integration will not work.')
}

const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET

export const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const CONVERSION_PAYMENT_AMOUNT_CENTS = 49
const CONVERSION_PAYMENT_CURRENCY = 'usd'
const CHECKOUT_EXPIRED_MESSAGE = 'Your checkout session expired. Please try payment again.'
const PAYMENT_INCOMPLETE_MESSAGE = 'Payment was not completed. Please try again.'

function normalizeCurrency(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? CONVERSION_PAYMENT_CURRENCY
}

function isPaidCheckoutSession(session: Stripe.Checkout.Session): boolean {
  return session.payment_status === 'paid'
}

function isExpiredCheckoutSession(session: Stripe.Checkout.Session): boolean {
  return session.status === 'expired' || Boolean(session.expires_at && session.expires_at * 1000 <= Date.now())
}

function makeCompletedSessionStub(
  fileId: string,
  payment: typeof payments.$inferSelect,
): Stripe.Checkout.Session {
  return {
    id: payment.stripeSessionId,
    metadata: { fileId },
    payment_intent: payment.stripePaymentIntent,
  } as unknown as Stripe.Checkout.Session
}

function validateCompletedSession(
  payment: typeof payments.$inferSelect,
  session: Stripe.Checkout.Session,
): void {
  if (session.payment_status && session.payment_status !== 'paid') {
    throw new Error('Stripe checkout session is not marked as paid.')
  }

  if (session.amount_total != null && session.amount_total !== payment.amountCents) {
    throw new Error('Stripe session amount does not match payment record.')
  }

  if (session.currency && normalizeCurrency(session.currency) !== normalizeCurrency(payment.currency)) {
    throw new Error('Stripe session currency does not match payment record.')
  }
}

async function updatePendingPaymentStatus(paymentId: number, status: string): Promise<void> {
  await db
    .update(payments)
    .set({ status })
    .where(and(eq(payments.id, paymentId), eq(payments.status, 'pending')))
}

async function restorePaymentRequired(fileId: string, message: string): Promise<void> {
  await db
    .update(conversions)
    .set({
      status: 'payment_required',
      errorMessage: message,
    })
    .where(and(eq(conversions.id, fileId), eq(conversions.status, 'pending_payment')))
}

async function getReusableCheckoutSession(
  fileId: string,
): Promise<{ checkoutUrl: string; sessionId: string } | undefined> {
  if (!stripe) {
    return undefined
  }

  const pendingPayments = await db
    .select()
    .from(payments)
    .where(and(
      eq(payments.fileId, fileId),
      eq(payments.status, 'pending'),
    ))
    .orderBy(desc(payments.createdAt))

  for (const payment of pendingPayments) {
    if (!payment.checkoutExpiresAt || new Date(payment.checkoutExpiresAt).getTime() <= Date.now()) {
      continue
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(payment.stripeSessionId)
      if (session.status === 'open' && session.url) {
        stripeLogger.info({
          fileId,
          stripeSessionId: session.id,
        }, 'Reusing open Stripe checkout session')
        return {
          checkoutUrl: session.url,
          sessionId: session.id,
        }
      }
    } catch (err) {
      stripeLogger.warn({
        fileId,
        stripeSessionId: payment.stripeSessionId,
        err,
      }, 'Failed to inspect reusable Stripe checkout session')
      continue
    }
  }

  return undefined
}

export async function createCheckoutSession(fileId: string): Promise<{ checkoutUrl: string; sessionId: string }> {
  const conversion = await db.query.conversions.findFirst({
    where: eq(conversions.id, fileId),
  })

  if (!conversion) {
    throw new Error('Conversion not found.')
  }

  if (conversion.status !== 'payment_required' && conversion.status !== 'pending_payment') {
    throw new Error(`Cannot create checkout for conversion with status "${conversion.status}".`)
  }

  if (!stripe) {
    throw new Error('Payment system is not configured.')
  }

  const reusableSession = await getReusableCheckoutSession(fileId)
  if (reusableSession) {
    await db
      .update(conversions)
      .set({
        status: 'pending_payment',
        errorMessage: null,
      })
      .where(eq(conversions.id, fileId))

    return reusableSession
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: CONVERSION_PAYMENT_CURRENCY,
          unit_amount: CONVERSION_PAYMENT_AMOUNT_CENTS,
          product_data: {
            name: `File conversion: ${conversion.conversionType}`,
          },
        },
        quantity: 1,
      },
    ],
    client_reference_id: fileId,
    metadata: {
      fileId,
      conversionType: conversion.conversionType,
    },
    success_url: `${BASE_URL}/${conversion.conversionType}?fileId=${fileId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${BASE_URL}/${conversion.conversionType}?fileId=${fileId}&canceled=true`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  })

  await db.transaction(async (tx) => {
    await tx
      .insert(payments)
      .values({
        fileId,
        stripeSessionId: session.id,
        amountCents: CONVERSION_PAYMENT_AMOUNT_CENTS,
        currency: CONVERSION_PAYMENT_CURRENCY,
        conversionType: conversion.conversionType,
        ipAddress: conversion.ipAddress,
        checkoutExpiresAt: session.expires_at
          ? new Date(session.expires_at * 1000).toISOString()
          : null,
        status: 'pending',
      })
      .onConflictDoNothing()

    await tx
      .update(conversions)
      .set({
        status: 'pending_payment',
        errorMessage: null,
      })
      .where(eq(conversions.id, fileId))
  })

  stripeLogger.info({
    fileId,
    stripeSessionId: session.id,
  }, 'Created Stripe checkout session')
  return { checkoutUrl: session.url!, sessionId: session.id }
}

export function verifyWebhookSignature(rawBody: string | Buffer, signature: string): Stripe.Event {
  if (!stripe) {
    throw new Error('Payment system is not configured.')
  }
  if (!stripeWebhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set.')
  }
  return stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret)
}

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const fileId = session.metadata?.fileId
  if (!fileId) {
    throw new Error('Missing fileId in Stripe session metadata.')
  }

  const payment = await db.query.payments.findFirst({
    where: eq(payments.stripeSessionId, session.id),
  })
  if (!payment) {
    throw new Error('No payment record found for Stripe session.')
  }
  if (payment.fileId !== fileId) {
    throw new Error('Stripe session fileId does not match payment record.')
  }

  const conversion = await db.query.conversions.findFirst({
    where: eq(conversions.id, fileId),
  })
  if (!conversion) {
    throw new Error('No conversion record found for fileId.')
  }

  validateCompletedSession(payment, session)

  const previousStatus = conversion.status

  // Idempotency: if payment already completed, check for recovery
  if (payment.status === 'completed') {
    if (previousStatus === 'pending_payment') {
      stripeLogger.info({
        fileId,
        stripeSessionId: session.id,
        previousStatus,
      }, 'Received duplicate Stripe webhook and re-queued pending conversion')
      await enqueueJob(fileId)
    }
    stripeLogger.info({
      fileId,
      stripeSessionId: session.id,
      previousStatus,
    }, 'Received duplicate Stripe webhook for completed payment')
    return
  }

  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({
        status: 'completed',
        stripePaymentIntent: typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
        completedAt: new Date().toISOString(),
      })
      .where(eq(payments.id, payment.id))

    await tx
      .update(conversions)
      .set({
        wasPaid: 1,
        errorMessage: null,
      })
      .where(eq(conversions.id, fileId))
  })

  if (previousStatus === 'pending_payment') {
    await enqueueJob(fileId)
  }

  stripeLogger.info({
    fileId,
    stripeSessionId: session.id,
    previousStatus,
  }, 'Completed Stripe checkout handling')
}

export async function reconcilePendingPayment(fileId: string): Promise<void> {
  const conversion = await db.query.conversions.findFirst({
    where: eq(conversions.id, fileId),
  })
  if (!conversion || conversion.status !== 'pending_payment') {
    return
  }

  const paymentRecords = await db
    .select()
    .from(payments)
    .where(eq(payments.fileId, fileId))
    .orderBy(desc(payments.createdAt), desc(payments.id))

  const completedPayment = paymentRecords.find((payment) => payment.status === 'completed')
  if (completedPayment) {
    await handleCheckoutCompleted(makeCompletedSessionStub(fileId, completedPayment))
    return
  }

  let sawActiveCheckout = false
  let restoreMessage: string | undefined

  for (const payment of paymentRecords) {
    if (payment.status !== 'pending') {
      continue
    }

    if (payment.checkoutExpiresAt && new Date(payment.checkoutExpiresAt).getTime() <= Date.now()) {
      await updatePendingPaymentStatus(payment.id, 'expired')
      restoreMessage ??= CHECKOUT_EXPIRED_MESSAGE
      continue
    }

    if (!stripe) {
      sawActiveCheckout = true
      continue
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(payment.stripeSessionId)

      if (isPaidCheckoutSession(session)) {
        await handleCheckoutCompleted(session)
        return
      }

      if (isExpiredCheckoutSession(session)) {
        await updatePendingPaymentStatus(payment.id, 'expired')
        restoreMessage ??= CHECKOUT_EXPIRED_MESSAGE
        continue
      }

      if (session.status === 'complete') {
        await updatePendingPaymentStatus(payment.id, 'failed')
        restoreMessage ??= PAYMENT_INCOMPLETE_MESSAGE
        continue
      }

      sawActiveCheckout = true
    } catch (err) {
      sawActiveCheckout = true
      stripeLogger.warn({
        fileId,
        stripeSessionId: payment.stripeSessionId,
        err,
      }, 'Failed to reconcile pending Stripe checkout session')
    }
  }

  if (!sawActiveCheckout && restoreMessage) {
    await restorePaymentRequired(fileId, restoreMessage)
  }
}
