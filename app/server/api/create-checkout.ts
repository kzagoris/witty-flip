import { createServerFn, createServerOnlyFn } from "@tanstack/react-start"
import { resolveRequestId, withRequestIdHeader } from "~/lib/observability"
import { createRequestLogger } from "~/lib/server-observability"
import {
    errorResult,
    isRecord,
    normalizeConversionStatus,
    type ApiErrorResponse,
    type ApiResult,
    type CheckoutResponse,
} from "./contracts"

interface CreateCheckoutServerDeps {
    eq: typeof import("drizzle-orm").eq
    db: typeof import("~/lib/db").db
    conversions: typeof import("~/lib/db/schema").conversions
    checkAndConsumeRequestRateLimit: typeof import("~/lib/request-rate-limit").checkAndConsumeRequestRateLimit
    initializeServerRuntime: typeof import("~/lib/server-runtime").initializeServerRuntime
    createCheckoutSession: typeof import("~/lib/stripe").createCheckoutSession
}

let createCheckoutServerDepsPromise: Promise<CreateCheckoutServerDeps> | undefined

const getCreateCheckoutServerDeps = createServerOnlyFn(async (): Promise<CreateCheckoutServerDeps> => {
    createCheckoutServerDepsPromise ??= Promise.all([
        import("drizzle-orm"),
        import("~/lib/db"),
        import("~/lib/db/schema"),
        import("~/lib/request-rate-limit"),
        import("~/lib/server-runtime"),
        import("~/lib/stripe"),
    ]).then(
        ([drizzleOrmModule, dbModule, schemaModule, requestRateLimitModule, serverRuntimeModule, stripeModule]) => ({
            eq: drizzleOrmModule.eq,
            db: dbModule.db,
            conversions: schemaModule.conversions,
            checkAndConsumeRequestRateLimit: requestRateLimitModule.checkAndConsumeRequestRateLimit,
            initializeServerRuntime: serverRuntimeModule.initializeServerRuntime,
            createCheckoutSession: stripeModule.createCheckoutSession,
        }),
    )

    return createCheckoutServerDepsPromise
})

interface CreateCheckoutRequestContextDeps {
    setResponseStatus: typeof import("@tanstack/react-start/server").setResponseStatus
    resolveClientIp: typeof import("~/lib/request-ip").resolveClientIp
    resolveClientIpFromRequest: typeof import("~/lib/request-ip").resolveClientIpFromRequest
}

let createCheckoutRequestContextPromise: Promise<CreateCheckoutRequestContextDeps> | undefined

const getCreateCheckoutRequestContext = createServerOnlyFn(async (): Promise<CreateCheckoutRequestContextDeps> => {
    createCheckoutRequestContextPromise ??= Promise.all([
        import("@tanstack/react-start/server"),
        import("~/lib/request-ip"),
    ]).then(([serverModule, requestIpModule]) => ({
        setResponseStatus: serverModule.setResponseStatus,
        resolveClientIp: requestIpModule.resolveClientIp,
        resolveClientIpFromRequest: requestIpModule.resolveClientIpFromRequest,
    }))

    return createCheckoutRequestContextPromise
})

function parseFileIdInput(data: unknown): string | undefined {
    if (!isRecord(data) || typeof data["fileId"] !== "string") {
        return undefined
    }

    const fileId = data["fileId"].trim()
    return fileId.length > 0 ? fileId : undefined
}

function mapCheckoutError(fileId: string, error: unknown): ApiResult<ApiErrorResponse> {
    const message = error instanceof Error ? error.message : "Unknown checkout error."

    if (message.startsWith("Cannot create checkout for conversion with status")) {
        return errorResult(409, "invalid_status", message, { fileId })
    }

    if (message === "Conversion not found.") {
        return errorResult(404, "not_found", message, { fileId })
    }

    return errorResult(500, "checkout_unavailable", "Unable to start checkout right now. Please try again.", {
        fileId,
    })
}

export async function processCreateCheckout(
    data: unknown,
    clientIp: string,
    context: { requestId?: string } = {},
): Promise<ApiResult<CheckoutResponse | ApiErrorResponse>> {
    const { eq, db, conversions, checkAndConsumeRequestRateLimit, initializeServerRuntime, createCheckoutSession } =
        await getCreateCheckoutServerDeps()

    initializeServerRuntime()
    const requestId = context.requestId ?? resolveRequestId()
    const requestLogger = createRequestLogger("/api/create-checkout", requestId, { clientIp })

    const requestLimit = checkAndConsumeRequestRateLimit(clientIp)
    if (!requestLimit.allowed) {
        requestLogger.warn({
            limit: requestLimit.limit,
            remaining: requestLimit.remaining,
            resetAt: requestLimit.resetAt,
        }, "Create-checkout request throttled")
        return errorResult(429, "request_rate_limited", "Too many requests. Please wait a minute and try again.", {
            limit: requestLimit.limit,
            remaining: requestLimit.remaining,
            resetAt: requestLimit.resetAt,
        })
    }

    const fileId = parseFileIdInput(data)
    if (!fileId) {
        return errorResult(400, "invalid_file_id", "A valid fileId is required.")
    }

    const conversion = await db.query.conversions.findFirst({
        where: eq(conversions.id, fileId),
    })

    if (!conversion) {
        return errorResult(404, "not_found", "Conversion not found.", { fileId })
    }

    const conversionStatus = normalizeConversionStatus(conversion.status)

    if (conversionStatus !== "payment_required" && conversionStatus !== "pending_payment") {
        return errorResult(
            409,
            "invalid_status",
            `Cannot create a checkout session for status "${conversionStatus}".`,
            {
                fileId,
                status: conversionStatus,
            },
        )
    }

    await db.update(conversions).set({ ipAddress: clientIp }).where(eq(conversions.id, fileId))

    try {
        const checkout = await createCheckoutSession(fileId)
        requestLogger.info({ fileId, sessionId: checkout.sessionId }, "Created checkout session")
        return {
            status: 200,
            body: {
                fileId,
                checkoutUrl: checkout.checkoutUrl,
                sessionId: checkout.sessionId,
            },
        }
    } catch (error) {
        const result = mapCheckoutError(fileId, error)
        if (result.status >= 500) {
            requestLogger.error({ fileId, err: error }, "Failed to create checkout session")
        } else {
            requestLogger.info({ fileId, status: result.status }, "Rejected checkout session request")
        }
        return result
    }
}

export async function handleCreateCheckoutHttpRequest(request: Request, peerIp?: string): Promise<Response> {
    const { resolveClientIpFromRequest } = await getCreateCheckoutRequestContext()

    const requestId = resolveRequestId(request)
    const result = await processCreateCheckout(await request.json(), resolveClientIpFromRequest(request, peerIp), { requestId })
    return Response.json(result.body, { status: result.status, headers: withRequestIdHeader(requestId) })
}

export const createCheckout = createServerFn({ method: "POST" }).handler(async ({ data }) => {
    const { setResponseStatus, resolveClientIp } = await getCreateCheckoutRequestContext()

    const result = await processCreateCheckout(data, resolveClientIp())
    setResponseStatus(result.status)
    return result.body
})
