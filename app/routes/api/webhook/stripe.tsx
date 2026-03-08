import type Stripe from 'stripe'
import { createFileRoute } from '@tanstack/react-router'
import { initializeServerRuntime } from '~/lib/server-runtime'
import { handleCheckoutCompleted, verifyWebhookSignature } from '~/lib/stripe'
import { errorResult } from '~/server/api/contracts'

function isUnrecoverableWebhookError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message === 'No payment record found for Stripe session.'
    || error.message === 'No conversion record found for fileId.'
}

function isConfigurationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message === 'Payment system is not configured.'
    || error.message === 'STRIPE_WEBHOOK_SECRET is not set.'
}

export async function handleStripeWebhookRequest(request: Request): Promise<Response> {
  initializeServerRuntime()

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    const result = errorResult(400, 'missing_signature', 'Missing Stripe signature header.')
    return Response.json(result.body, { status: result.status })
  }

  const rawBody = await request.text()

  let event: Stripe.Event
  try {
    event = verifyWebhookSignature(rawBody, signature)
  } catch (error) {
    if (isConfigurationError(error)) {
      const result = errorResult(500, 'stripe_not_configured', 'Stripe webhook verification is not configured.')
      return Response.json(result.body, { status: result.status })
    }

    const result = errorResult(400, 'invalid_signature', 'The Stripe webhook signature is invalid.')
    return Response.json(result.body, { status: result.status })
  }

  if (event.type === 'checkout.session.completed') {
    try {
      await handleCheckoutCompleted(event.data.object)
    } catch (error) {
      if (isUnrecoverableWebhookError(error)) {
        return Response.json({ received: true }, { status: 200 })
      }
      throw error
    }
  }

  return Response.json({ received: true }, { status: 200 })
}

export const Route = createFileRoute('/api/webhook/stripe')({
  server: {
    handlers: {
      POST: async ({ request }) => handleStripeWebhookRequest(request),
    },
  },
})
