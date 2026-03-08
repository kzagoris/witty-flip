import Stripe from 'stripe'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '~/lib/db'
import { conversions, payments } from '~/lib/db/schema'
import { enqueueJob } from '~/lib/queue'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY
if (!stripeSecretKey) {
  console.warn('STRIPE_SECRET_KEY is not set. Stripe integration will not work.')
}

const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET

export const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'

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
        return {
          checkoutUrl: session.url,
          sessionId: session.id,
        }
      }
    } catch {
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
      .set({ status: 'pending_payment' })
      .where(eq(conversions.id, fileId))

    return reusableSession
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: 49,
          product_data: {
            name: `File conversion: ${conversion.conversionType}`,
          },
        },
        quantity: 1,
      },
    ],
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
        amountCents: 49,
        currency: 'usd',
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
      .set({ status: 'pending_payment' })
      .where(eq(conversions.id, fileId))
  })

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

  const conversion = await db.query.conversions.findFirst({
    where: eq(conversions.id, fileId),
  })
  if (!conversion) {
    throw new Error('No conversion record found for fileId.')
  }

  const previousStatus = conversion.status

  // Idempotency: if payment already completed, check for recovery
  if (payment.status === 'completed') {
    if (previousStatus === 'pending_payment') {
      await enqueueJob(fileId)
    }
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
      .set({ wasPaid: 1 })
      .where(eq(conversions.id, fileId))
  })

  if (previousStatus === 'pending_payment') {
    await enqueueJob(fileId)
  }
}
