import type Stripe from "stripe"
import { createFileRoute } from "@tanstack/react-router"
import { createServerOnlyFn } from "@tanstack/react-start"
import { resolveRequestId, withRequestIdHeader } from "~/lib/observability"
import { errorResult } from "~/server/api/contracts"

interface StripeWebhookServerDeps {
    initializeServerRuntime: typeof import("~/lib/server-runtime").initializeServerRuntime
    handleCheckoutCompleted: typeof import("~/lib/stripe").handleCheckoutCompleted
    verifyWebhookSignature: typeof import("~/lib/stripe").verifyWebhookSignature
}

let stripeWebhookServerDepsPromise: Promise<StripeWebhookServerDeps> | undefined

const getStripeWebhookServerDeps = createServerOnlyFn(async (): Promise<StripeWebhookServerDeps> => {
    stripeWebhookServerDepsPromise ??= Promise.all([import("~/lib/server-runtime"), import("~/lib/stripe")]).then(
        ([serverRuntimeModule, stripeModule]) => ({
            initializeServerRuntime: serverRuntimeModule.initializeServerRuntime,
            handleCheckoutCompleted: stripeModule.handleCheckoutCompleted,
            verifyWebhookSignature: stripeModule.verifyWebhookSignature,
        }),
    )

    return stripeWebhookServerDepsPromise
})

function isUnrecoverableWebhookError(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    return (
        error.message === "No payment record found for Stripe session." ||
        error.message === "No conversion record found for fileId." ||
        error.message === "No client conversion attempt record found for attemptId."
    )
}

function isConfigurationError(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    return (
        error.message === "Payment system is not configured." || error.message === "STRIPE_WEBHOOK_SECRET is not set."
    )
}

export async function handleStripeWebhookRequest(request: Request): Promise<Response> {
    const requestId = resolveRequestId(request)
    const responseHeaders = withRequestIdHeader(requestId)
    const { createRequestLogger } = await import("~/lib/server-observability")
    const requestLogger = createRequestLogger("/api/webhook/stripe", requestId)
    const { initializeServerRuntime, handleCheckoutCompleted, verifyWebhookSignature } =
        await getStripeWebhookServerDeps()

    initializeServerRuntime()

    const signature = request.headers.get("stripe-signature")
    if (!signature) {
        requestLogger.warn("Stripe webhook missing signature header")
        const result = errorResult(400, "missing_signature", "Missing Stripe signature header.")
        return Response.json(result.body, { status: result.status, headers: responseHeaders })
    }

    const rawBody = await request.text()

    let event: Stripe.Event
    try {
        event = verifyWebhookSignature(rawBody, signature)
    } catch (error) {
        if (isConfigurationError(error)) {
            requestLogger.error({ err: error }, "Stripe webhook verification is not configured")
            const result = errorResult(500, "stripe_not_configured", "Stripe webhook verification is not configured.")
            return Response.json(result.body, { status: result.status, headers: responseHeaders })
        }

        requestLogger.warn({ err: error }, "Stripe webhook signature verification failed")
        const result = errorResult(400, "invalid_signature", "The Stripe webhook signature is invalid.")
        return Response.json(result.body, { status: result.status, headers: responseHeaders })
    }

    const eventLogger = requestLogger.child({
        stripeEventId: event.id,
        stripeEventType: event.type,
    })

    if (event.type === "checkout.session.completed") {
        const checkoutSession = event.data.object
        try {
            await handleCheckoutCompleted(checkoutSession)
            eventLogger.info({ stripeSessionId: checkoutSession.id }, "Processed Stripe checkout.session.completed webhook")
        } catch (error) {
            if (isUnrecoverableWebhookError(error)) {
                eventLogger.warn({ stripeSessionId: checkoutSession.id, err: error }, "Acknowledged Stripe webhook with unrecoverable application state")
                return Response.json({ received: true }, { status: 200, headers: responseHeaders })
            }
            eventLogger.error({ stripeSessionId: checkoutSession.id, err: error }, "Stripe webhook processing failed")
            throw error
        }
    }

    return Response.json({ received: true }, { status: 200, headers: responseHeaders })
}

export const Route = createFileRoute("/api/webhook/stripe")({
    server: {
        handlers: {
            POST: async ({ request }) => handleStripeWebhookRequest(request),
        },
    },
})
