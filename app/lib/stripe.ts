import '~/lib/load-env'
import Stripe from 'stripe'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '~/lib/db'
import { clientConversionAttempts, conversions, payments } from '~/lib/db/schema'
import {
  createClientAttemptToken,
  getClientAttemptExpiresAt,
  hashClientAttemptToken,
  isClientAttemptExpired,
} from '~/lib/client-conversion-attempts'
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

type PaymentRecord = typeof payments.$inferSelect

type CheckoutReference =
  | { kind: 'server'; fileId: string }
  | { kind: 'client'; attemptId: string }

function normalizeCurrency(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? CONVERSION_PAYMENT_CURRENCY
}

function isPaidCheckoutSession(session: Stripe.Checkout.Session): boolean {
  return session.payment_status === 'paid'
}

function isExpiredCheckoutSession(session: Stripe.Checkout.Session): boolean {
  return session.status === 'expired' || Boolean(session.expires_at && session.expires_at * 1000 <= Date.now())
}

function getPaymentReference(payment: PaymentRecord): CheckoutReference {
  if (payment.fileId) {
    return { kind: 'server', fileId: payment.fileId }
  }

  if (payment.clientAttemptId) {
    return { kind: 'client', attemptId: payment.clientAttemptId }
  }

  throw new Error('Payment record is missing its conversion reference.')
}

function getSessionReference(session: Stripe.Checkout.Session): CheckoutReference {
  const fileId = session.metadata?.fileId?.trim()
  const attemptId = session.metadata?.attemptId?.trim()

  if (fileId && attemptId) {
    throw new Error('Stripe session metadata must not contain both fileId and attemptId.')
  }

  if (fileId) {
    return { kind: 'server', fileId }
  }

  if (attemptId) {
    return { kind: 'client', attemptId }
  }

  throw new Error('Missing fileId or attemptId in Stripe session metadata.')
}

function buildReferenceLogFields(reference: CheckoutReference): Record<string, string> {
  return reference.kind === 'server'
    ? { fileId: reference.fileId }
    : { attemptId: reference.attemptId }
}

function makeCompletedSessionStub(payment: PaymentRecord): Stripe.Checkout.Session {
  const metadata = payment.fileId
    ? { fileId: payment.fileId }
    : { attemptId: payment.clientAttemptId! }

  return {
    id: payment.stripeSessionId,
    metadata,
    payment_intent: payment.stripePaymentIntent,
  } as unknown as Stripe.Checkout.Session
}

function validateCompletedSession(
  payment: PaymentRecord,
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

function assertSessionMatchesPayment(
  sessionReference: CheckoutReference,
  paymentReference: CheckoutReference,
): void {
  if (sessionReference.kind !== paymentReference.kind) {
    throw new Error('Stripe session reference type does not match payment record.')
  }

  if (sessionReference.kind === 'server' && paymentReference.kind === 'server') {
    if (paymentReference.fileId !== sessionReference.fileId) {
      throw new Error('Stripe session fileId does not match payment record.')
    }
    return
  }

  if (sessionReference.kind === 'client' && paymentReference.kind === 'client'
    && paymentReference.attemptId !== sessionReference.attemptId) {
    throw new Error('Stripe session attemptId does not match payment record.')
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

async function restoreClientPaymentRequired(attemptId: string, message: string): Promise<void> {
  await db
    .update(clientConversionAttempts)
    .set({
      status: 'payment_required',
      errorCode: null,
      errorMessage: message,
      recoveryToken: null,
    })
    .where(and(eq(clientConversionAttempts.id, attemptId), eq(clientConversionAttempts.status, 'pending_payment')))
}

async function getReusableCheckoutSession(
  reference: CheckoutReference,
): Promise<{ checkoutUrl: string; sessionId: string } | undefined> {
  if (!stripe) {
    return undefined
  }

  const pendingPayments = await db
    .select()
    .from(payments)
    .where(reference.kind === 'server'
      ? and(eq(payments.fileId, reference.fileId), eq(payments.status, 'pending'))
      : and(eq(payments.clientAttemptId, reference.attemptId), eq(payments.status, 'pending')))
    .orderBy(desc(payments.createdAt))

  for (const payment of pendingPayments) {
    if (!payment.checkoutExpiresAt || new Date(payment.checkoutExpiresAt).getTime() <= Date.now()) {
      continue
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(payment.stripeSessionId)
      if (session.status === 'open' && session.url) {
        stripeLogger.info({
          ...buildReferenceLogFields(reference),
          stripeSessionId: session.id,
        }, 'Reusing open Stripe checkout session')
        return {
          checkoutUrl: session.url,
          sessionId: session.id,
        }
      }
    } catch (err) {
      stripeLogger.warn({
        ...buildReferenceLogFields(reference),
        stripeSessionId: payment.stripeSessionId,
        err,
      }, 'Failed to inspect reusable Stripe checkout session')
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

  const reusableSession = await getReusableCheckoutSession({ kind: 'server', fileId })
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

export async function createClientCheckoutSession(
  attemptId: string,
): Promise<{ checkoutUrl: string; sessionId: string }> {
  const attempt = await db.query.clientConversionAttempts.findFirst({
    where: eq(clientConversionAttempts.id, attemptId),
  })

  if (!attempt) {
    throw new Error('Client conversion attempt not found.')
  }

  if (attempt.status === 'expired' || isClientAttemptExpired(attempt.expiresAt)) {
    throw new Error('Client conversion attempt has expired.')
  }

  if (attempt.status !== 'payment_required' && attempt.status !== 'pending_payment') {
    throw new Error(`Cannot create checkout for client conversion with status "${attempt.status}".`)
  }

  if (!stripe) {
    throw new Error('Payment system is not configured.')
  }

  const reusableSession = await getReusableCheckoutSession({ kind: 'client', attemptId })
  if (reusableSession) {
    await db
      .update(clientConversionAttempts)
      .set({
        status: 'pending_payment',
        errorCode: null,
        errorMessage: null,
        expiresAt: getClientAttemptExpiresAt(),
      })
      .where(eq(clientConversionAttempts.id, attemptId))

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
            name: `Client conversion: ${attempt.conversionType}`,
          },
        },
        quantity: 1,
      },
    ],
    client_reference_id: attemptId,
    metadata: {
      attemptId,
      conversionType: attempt.conversionType,
    },
    success_url: `${BASE_URL}/${attempt.conversionType}?attemptId=${attemptId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${BASE_URL}/${attempt.conversionType}?attemptId=${attemptId}&canceled=true`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  })

  await db.transaction(async (tx) => {
    await tx
      .insert(payments)
      .values({
        clientAttemptId: attemptId,
        stripeSessionId: session.id,
        amountCents: CONVERSION_PAYMENT_AMOUNT_CENTS,
        currency: CONVERSION_PAYMENT_CURRENCY,
        conversionType: attempt.conversionType,
        ipAddress: attempt.ipAddress,
        checkoutExpiresAt: session.expires_at
          ? new Date(session.expires_at * 1000).toISOString()
          : null,
        status: 'pending',
      })
      .onConflictDoNothing()

    await tx
      .update(clientConversionAttempts)
      .set({
        status: 'pending_payment',
        errorCode: null,
        errorMessage: null,
        expiresAt: getClientAttemptExpiresAt(),
      })
      .where(eq(clientConversionAttempts.id, attemptId))
  })

  stripeLogger.info({
    attemptId,
    stripeSessionId: session.id,
  }, 'Created Stripe checkout session for client conversion')

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

async function handleServerCheckoutCompleted(
  fileId: string,
  payment: PaymentRecord,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const conversion = await db.query.conversions.findFirst({
    where: eq(conversions.id, fileId),
  })
  if (!conversion) {
    throw new Error('No conversion record found for fileId.')
  }

  validateCompletedSession(payment, session)
  const previousStatus = conversion.status

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

async function moveClientAttemptToReady(attemptId: string): Promise<void> {
  const recoveryToken = createClientAttemptToken()

  await db
    .update(clientConversionAttempts)
    .set({
      status: 'ready',
      wasPaid: 1,
      tokenHash: hashClientAttemptToken(recoveryToken),
      recoveryToken,
      expiresAt: getClientAttemptExpiresAt(),
      errorCode: null,
      errorMessage: null,
    })
    .where(eq(clientConversionAttempts.id, attemptId))
}

async function handleClientCheckoutCompleted(
  attemptId: string,
  payment: PaymentRecord,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const attempt = await db.query.clientConversionAttempts.findFirst({
    where: eq(clientConversionAttempts.id, attemptId),
  })

  if (!attempt) {
    throw new Error('No client conversion attempt record found for attemptId.')
  }

  validateCompletedSession(payment, session)
  const previousStatus = attempt.status
  const shouldMoveToReady = previousStatus === 'pending_payment' || previousStatus === 'payment_required' || previousStatus === 'expired'

  if (payment.status === 'completed') {
    if (shouldMoveToReady) {
      await moveClientAttemptToReady(attemptId)
      stripeLogger.info({
        attemptId,
        stripeSessionId: session.id,
        previousStatus,
      }, previousStatus === 'expired'
        ? 'Recovered expired client conversion attempt after payment completed'
        : 'Recovered client conversion attempt after duplicate Stripe webhook')
      return
    }

    stripeLogger.info({
      attemptId,
      stripeSessionId: session.id,
      previousStatus,
    }, 'Received duplicate Stripe webhook for completed client conversion payment')
    return
  }

  const completedAt = new Date().toISOString()
  const recoveryToken = shouldMoveToReady ? createClientAttemptToken() : null

  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({
        status: 'completed',
        stripePaymentIntent: typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
        completedAt,
      })
      .where(eq(payments.id, payment.id))

    await tx
      .update(clientConversionAttempts)
      .set(shouldMoveToReady
        ? {
            status: 'ready',
            wasPaid: 1,
            tokenHash: hashClientAttemptToken(recoveryToken!),
            recoveryToken,
            expiresAt: getClientAttemptExpiresAt(),
            errorCode: null,
            errorMessage: null,
          }
        : {
            wasPaid: 1,
          })
      .where(eq(clientConversionAttempts.id, attemptId))
  })

  stripeLogger.info({
    attemptId,
    stripeSessionId: session.id,
    previousStatus,
  }, previousStatus === 'expired'
    ? 'Recovered expired client conversion attempt after payment completed'
    : 'Completed Stripe checkout handling for client conversion')
}

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const sessionReference = getSessionReference(session)

  const payment = await db.query.payments.findFirst({
    where: eq(payments.stripeSessionId, session.id),
  })
  if (!payment) {
    throw new Error('No payment record found for Stripe session.')
  }

  const paymentReference = getPaymentReference(payment)
  assertSessionMatchesPayment(sessionReference, paymentReference)

  if (sessionReference.kind === 'server') {
    await handleServerCheckoutCompleted(sessionReference.fileId, payment, session)
    return
  }

  await handleClientCheckoutCompleted(sessionReference.attemptId, payment, session)
}

async function reconcilePendingPayments(
  reference: CheckoutReference,
  paymentRecords: PaymentRecord[],
): Promise<void> {
  const completedPayment = paymentRecords.find((payment) => payment.status === 'completed')
  if (completedPayment) {
    await handleCheckoutCompleted(makeCompletedSessionStub(completedPayment))
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
        ...buildReferenceLogFields(reference),
        stripeSessionId: payment.stripeSessionId,
        err,
      }, 'Failed to reconcile pending Stripe checkout session')
    }
  }

  if (!sawActiveCheckout && restoreMessage) {
    if (reference.kind === 'server') {
      await restorePaymentRequired(reference.fileId, restoreMessage)
    } else {
      await restoreClientPaymentRequired(reference.attemptId, restoreMessage)
    }
  }
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

  await reconcilePendingPayments({ kind: 'server', fileId }, paymentRecords)
}

export async function reconcileClientPendingPayment(attemptId: string): Promise<void> {
  const attempt = await db.query.clientConversionAttempts.findFirst({
    where: eq(clientConversionAttempts.id, attemptId),
  })
  if (!attempt || attempt.status !== 'pending_payment') {
    return
  }

  const paymentRecords = await db
    .select()
    .from(payments)
    .where(eq(payments.clientAttemptId, attemptId))
    .orderBy(desc(payments.createdAt), desc(payments.id))

  await reconcilePendingPayments({ kind: 'client', attemptId }, paymentRecords)
}
