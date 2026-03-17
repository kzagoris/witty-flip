import { createServerFn, createServerOnlyFn } from "@tanstack/react-start"
import { resolveRequestId, withRequestIdHeader } from "~/lib/observability"
import { createRequestLogger } from "~/lib/server-observability"
import {
    errorResult,
    isRecord,
    type ClientCheckoutResponse,
    normalizeConversionStatus,
    type ApiErrorResponse,
    type ApiResult,
    type ServerCheckoutResponse,
} from "./contracts"

interface CreateCheckoutServerDeps {
    eq: typeof import("drizzle-orm").eq
    db: typeof import("~/lib/db").db
    clientConversionAttempts: typeof import("~/lib/db/schema").clientConversionAttempts
    conversions: typeof import("~/lib/db/schema").conversions
    isClientAttemptExpired: typeof import("~/lib/client-conversion-attempts").isClientAttemptExpired
    normalizeClientAttemptStatus: typeof import("~/lib/client-conversion-attempts").normalizeClientAttemptStatus
    checkAndConsumeRequestRateLimit: typeof import("~/lib/request-rate-limit").checkAndConsumeRequestRateLimit
    initializeServerRuntime: typeof import("~/lib/server-runtime").initializeServerRuntime
    createClientCheckoutSession: typeof import("~/lib/stripe").createClientCheckoutSession
    createCheckoutSession: typeof import("~/lib/stripe").createCheckoutSession
}

let createCheckoutServerDepsPromise: Promise<CreateCheckoutServerDeps> | undefined

const getCreateCheckoutServerDeps = createServerOnlyFn(async (): Promise<CreateCheckoutServerDeps> => {
    createCheckoutServerDepsPromise ??= Promise.all([
        import("drizzle-orm"),
        import("~/lib/db"),
        import("~/lib/db/schema"),
        import("~/lib/client-conversion-attempts"),
        import("~/lib/request-rate-limit"),
        import("~/lib/server-runtime"),
        import("~/lib/stripe"),
    ]).then(
        ([
            drizzleOrmModule,
            dbModule,
            schemaModule,
            clientConversionAttemptsModule,
            requestRateLimitModule,
            serverRuntimeModule,
            stripeModule,
        ]) => ({
            eq: drizzleOrmModule.eq,
            db: dbModule.db,
            clientConversionAttempts: schemaModule.clientConversionAttempts,
            conversions: schemaModule.conversions,
            isClientAttemptExpired: clientConversionAttemptsModule.isClientAttemptExpired,
            normalizeClientAttemptStatus: clientConversionAttemptsModule.normalizeClientAttemptStatus,
            checkAndConsumeRequestRateLimit: requestRateLimitModule.checkAndConsumeRequestRateLimit,
            initializeServerRuntime: serverRuntimeModule.initializeServerRuntime,
            createClientCheckoutSession: stripeModule.createClientCheckoutSession,
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

type CheckoutTarget = { kind: "server"; fileId: string } | { kind: "client"; attemptId: string }

function parseCheckoutRequest(data: unknown): CheckoutTarget | ApiResult<ApiErrorResponse> {
    if (!isRecord(data)) {
        return errorResult(400, "invalid_request", "A valid checkout request is required.")
    }

    const fileId = typeof data["fileId"] === "string" ? data["fileId"].trim() : ""
    const attemptId = typeof data["attemptId"] === "string" ? data["attemptId"].trim() : ""

    if (Boolean(fileId) === Boolean(attemptId)) {
        return errorResult(400, "invalid_request", "Provide exactly one of fileId or attemptId.")
    }

    return fileId ? { kind: "server", fileId } : { kind: "client", attemptId }
}

function mapCheckoutError(
    target: CheckoutTarget,
    error: unknown,
): ApiResult<ApiErrorResponse> {
    const message = error instanceof Error ? error.message : "Unknown checkout error."
    const extras = target.kind === "server" ? { fileId: target.fileId } : { attemptId: target.attemptId }

    if (message.startsWith("Cannot create checkout for conversion with status")) {
        return errorResult(409, "invalid_status", message, extras)
    }

    if (message.startsWith("Cannot create checkout for client conversion with status")) {
        return errorResult(409, "invalid_status", message, extras)
    }

    if (message === "Conversion not found." || message === "Client conversion attempt not found.") {
        return errorResult(404, "not_found", message, extras)
    }

    if (message === "Client conversion attempt has expired.") {
        return errorResult(410, "attempt_expired", "This conversion attempt has expired. Please start again.", {
            ...extras,
            status: "expired",
        })
    }

    return errorResult(
        500,
        "checkout_unavailable",
        "Unable to start checkout right now. Please try again.",
        extras,
    )
}

export async function processCreateCheckout(
    data: unknown,
    clientIp: string,
    context: { requestId?: string } = {},
): Promise<ApiResult<ServerCheckoutResponse | ClientCheckoutResponse | ApiErrorResponse>> {
    const {
        eq,
        db,
        clientConversionAttempts,
        conversions,
        isClientAttemptExpired,
        normalizeClientAttemptStatus,
        checkAndConsumeRequestRateLimit,
        initializeServerRuntime,
        createClientCheckoutSession,
        createCheckoutSession,
    } = await getCreateCheckoutServerDeps()

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

    const target = parseCheckoutRequest(data)
    if ("status" in target && "body" in target) {
        return target
    }

    if (target.kind === "server") {
        const conversion = await db.query.conversions.findFirst({
            where: eq(conversions.id, target.fileId),
        })

        if (!conversion) {
            return errorResult(404, "not_found", "Conversion not found.", { fileId: target.fileId })
        }

        const conversionStatus = normalizeConversionStatus(conversion.status)

        if (conversionStatus !== "payment_required" && conversionStatus !== "pending_payment") {
            return errorResult(
                409,
                "invalid_status",
                `Cannot create a checkout session for status "${conversionStatus}".`,
                {
                    fileId: target.fileId,
                    status: conversionStatus,
                },
            )
        }

        await db.update(conversions).set({ ipAddress: clientIp }).where(eq(conversions.id, target.fileId))

        try {
            const checkout = await createCheckoutSession(target.fileId)
            requestLogger.info({ fileId: target.fileId, sessionId: checkout.sessionId }, "Created checkout session")
            return {
                status: 200,
                body: {
                    fileId: target.fileId,
                    checkoutUrl: checkout.checkoutUrl,
                    sessionId: checkout.sessionId,
                },
            }
        } catch (error) {
            const result = mapCheckoutError(target, error)
            if (result.status >= 500) {
                requestLogger.error({ fileId: target.fileId, err: error }, "Failed to create checkout session")
            } else {
                requestLogger.info({ fileId: target.fileId, status: result.status }, "Rejected checkout session request")
            }
            return result
        }
    }

    const attempt = await db.query.clientConversionAttempts.findFirst({
        where: eq(clientConversionAttempts.id, target.attemptId),
    })

    if (!attempt) {
        return errorResult(404, "not_found", "Client conversion attempt not found.", { attemptId: target.attemptId })
    }

    if (isClientAttemptExpired(attempt.expiresAt)) {
        return errorResult(410, "attempt_expired", "This conversion attempt has expired. Please start again.", {
            attemptId: target.attemptId,
            status: "expired",
        })
    }

    const attemptStatus = normalizeClientAttemptStatus(attempt.status)
    if (attemptStatus !== "payment_required" && attemptStatus !== "pending_payment") {
        return errorResult(
            409,
            "invalid_status",
            `Cannot create a checkout session for status "${attemptStatus}".`,
            {
                attemptId: target.attemptId,
                status: attemptStatus,
            },
        )
    }

    try {
        const checkout = await createClientCheckoutSession(target.attemptId)
        requestLogger.info({ attemptId: target.attemptId, sessionId: checkout.sessionId }, "Created client checkout session")
        return {
            status: 200,
            body: {
                attemptId: target.attemptId,
                checkoutUrl: checkout.checkoutUrl,
                sessionId: checkout.sessionId,
            },
        }
    } catch (error) {
        const result = mapCheckoutError(target, error)
        if (result.status >= 500) {
            requestLogger.error({ attemptId: target.attemptId, err: error }, "Failed to create client checkout session")
        } else {
            requestLogger.info({ attemptId: target.attemptId, status: result.status }, "Rejected client checkout session request")
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
