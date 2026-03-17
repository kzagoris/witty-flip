import { createServerFn, createServerOnlyFn } from "@tanstack/react-start"
import { resolveRequestId, withRequestIdHeader } from "~/lib/observability"
import { createRequestLogger } from "~/lib/server-observability"
import {
    errorResult,
    isRecord,
    type ApiErrorResponse,
    type ApiResult,
    type ClientConversionFailRequest,
    type ClientConversionFailResponse,
} from "./contracts"

interface ClientConversionFailServerDeps {
    and: typeof import("drizzle-orm").and
    eq: typeof import("drizzle-orm").eq
    inArray: typeof import("drizzle-orm").inArray
    db: typeof import("~/lib/db").db
    clientConversionAttempts: typeof import("~/lib/db/schema").clientConversionAttempts
    releaseRateLimitSlot: typeof import("~/lib/rate-limit").releaseRateLimitSlot
    hashClientAttemptToken: typeof import("~/lib/client-conversion-attempts").hashClientAttemptToken
    checkAndConsumeRequestRateLimit: typeof import("~/lib/request-rate-limit").checkAndConsumeRequestRateLimit
    CLIENT_CONVERSION_REQUESTS_PER_MINUTE_LIMIT: typeof import("~/lib/request-rate-limit").CLIENT_CONVERSION_REQUESTS_PER_MINUTE_LIMIT
    initializeServerRuntime: typeof import("~/lib/server-runtime").initializeServerRuntime
}

let clientConversionFailServerDepsPromise: Promise<ClientConversionFailServerDeps> | undefined

const getClientConversionFailServerDeps = createServerOnlyFn(async (): Promise<ClientConversionFailServerDeps> => {
    clientConversionFailServerDepsPromise ??= Promise.all([
        import("drizzle-orm"),
        import("~/lib/db"),
        import("~/lib/db/schema"),
        import("~/lib/rate-limit"),
        import("~/lib/client-conversion-attempts"),
        import("~/lib/request-rate-limit"),
        import("~/lib/server-runtime"),
    ]).then(
        ([
            drizzleOrmModule,
            dbModule,
            schemaModule,
            rateLimitModule,
            clientConversionAttemptsModule,
            requestRateLimitModule,
            serverRuntimeModule,
        ]) => ({
            and: drizzleOrmModule.and,
            eq: drizzleOrmModule.eq,
            inArray: drizzleOrmModule.inArray,
            db: dbModule.db,
            clientConversionAttempts: schemaModule.clientConversionAttempts,
            releaseRateLimitSlot: rateLimitModule.releaseRateLimitSlot,
            hashClientAttemptToken: clientConversionAttemptsModule.hashClientAttemptToken,
            checkAndConsumeRequestRateLimit: requestRateLimitModule.checkAndConsumeRequestRateLimit,
            CLIENT_CONVERSION_REQUESTS_PER_MINUTE_LIMIT:
                requestRateLimitModule.CLIENT_CONVERSION_REQUESTS_PER_MINUTE_LIMIT,
            initializeServerRuntime: serverRuntimeModule.initializeServerRuntime,
        }),
    )

    return clientConversionFailServerDepsPromise
})

interface ClientConversionFailRequestContextDeps {
    setResponseStatus: typeof import("@tanstack/react-start/server").setResponseStatus
    resolveClientIp: typeof import("~/lib/request-ip").resolveClientIp
    resolveClientIpFromRequest: typeof import("~/lib/request-ip").resolveClientIpFromRequest
}

let clientConversionFailRequestContextPromise: Promise<ClientConversionFailRequestContextDeps> | undefined

const getClientConversionFailRequestContext = createServerOnlyFn(async (): Promise<ClientConversionFailRequestContextDeps> => {
    clientConversionFailRequestContextPromise ??= Promise.all([
        import("@tanstack/react-start/server"),
        import("~/lib/request-ip"),
    ]).then(([serverModule, requestIpModule]) => ({
        setResponseStatus: serverModule.setResponseStatus,
        resolveClientIp: requestIpModule.resolveClientIp,
        resolveClientIpFromRequest: requestIpModule.resolveClientIpFromRequest,
    }))

    return clientConversionFailRequestContextPromise
})

function parseClientConversionFailInput(
    data: unknown,
): ClientConversionFailRequest | ApiResult<ApiErrorResponse> {
    if (!isRecord(data)) {
        return errorResult(400, "invalid_request", "A valid client conversion failure request is required.")
    }

    const attemptId = typeof data["attemptId"] === "string" ? data["attemptId"].trim() : ""
    if (!attemptId) {
        return errorResult(400, "invalid_attempt_id", "A valid attemptId is required.")
    }

    const token = typeof data["token"] === "string" ? data["token"].trim() : ""
    if (!token) {
        return errorResult(400, "invalid_token", "A valid token is required.")
    }

    const errorCode = typeof data["errorCode"] === "string" ? data["errorCode"].trim() : ""
    if (!errorCode) {
        return errorResult(400, "invalid_error_code", "A valid errorCode is required.")
    }

    const errorMessage = typeof data["errorMessage"] === "string" ? data["errorMessage"].trim() : undefined

    return {
        attemptId,
        token,
        errorCode,
        errorMessage: errorMessage && errorMessage.length > 0 ? errorMessage : undefined,
    }
}

export async function processClientConversionFail(
    data: unknown,
    clientIp: string,
    context: { requestId?: string } = {},
): Promise<ApiResult<ClientConversionFailResponse | ApiErrorResponse>> {
    const {
        and,
        eq,
        inArray,
        db,
        clientConversionAttempts,
        releaseRateLimitSlot,
        hashClientAttemptToken,
        checkAndConsumeRequestRateLimit,
        CLIENT_CONVERSION_REQUESTS_PER_MINUTE_LIMIT,
        initializeServerRuntime,
    } = await getClientConversionFailServerDeps()

    initializeServerRuntime()
    const requestId = context.requestId ?? resolveRequestId()
    const requestLogger = createRequestLogger("/api/client-conversion/fail", requestId, { clientIp })

    const requestLimit = checkAndConsumeRequestRateLimit(clientIp, Date.now(), {
        bucketKey: "client-conversion",
        limit: CLIENT_CONVERSION_REQUESTS_PER_MINUTE_LIMIT,
    })
    if (!requestLimit.allowed) {
        requestLogger.warn({
            limit: requestLimit.limit,
            remaining: requestLimit.remaining,
            resetAt: requestLimit.resetAt,
        }, "Client conversion fail request throttled")
        return errorResult(429, "request_rate_limited", "Too many requests. Please wait a minute and try again.", {
            limit: requestLimit.limit,
            remaining: requestLimit.remaining,
            resetAt: requestLimit.resetAt,
        })
    }

    const parsed = parseClientConversionFailInput(data)
    if ("status" in parsed && "body" in parsed) {
        return parsed
    }

    const attempt = await db.query.clientConversionAttempts.findFirst({
        where: eq(clientConversionAttempts.id, parsed.attemptId),
    })

    if (!attempt) {
        return errorResult(404, "not_found", "Client conversion attempt not found.", { attemptId: parsed.attemptId })
    }

    if (hashClientAttemptToken(parsed.token) !== attempt.tokenHash) {
        return errorResult(403, "invalid_token", "The provided client conversion token is invalid.", {
            attemptId: parsed.attemptId,
        })
    }

    const completedAt = new Date().toISOString()

    try {
        const failureResult = await db.transaction(async (tx) => {
            const updateResult = await tx
                .update(clientConversionAttempts)
                .set({
                    status: "failed",
                    errorCode: parsed.errorCode,
                    errorMessage: parsed.errorMessage ?? "Client conversion failed.",
                    recoveryToken: null,
                    completedAt,
                })
                .where(and(
                    eq(clientConversionAttempts.id, parsed.attemptId),
                    inArray(clientConversionAttempts.status, ["reserved", "ready"]),
                ))

            if (updateResult.rowsAffected > 0) {
                if (attempt.wasPaid !== 1 && attempt.rateLimitDate) {
                    await releaseRateLimitSlot(attempt.ipAddress, attempt.rateLimitDate, tx)
                }

                return { released: true as const }
            }

            const currentAttempt = await tx.query.clientConversionAttempts.findFirst({
                where: eq(clientConversionAttempts.id, parsed.attemptId),
            })

            return { currentAttempt }
        })

        if ("released" in failureResult) {
            requestLogger.info({ attemptId: parsed.attemptId, errorCode: parsed.errorCode }, "Recorded failed client conversion")
            return {
                status: 200,
                body: { released: true },
            }
        }

        const currentStatus = failureResult.currentAttempt?.status
        if (currentStatus === "failed") {
            return {
                status: 200,
                body: { released: true },
            }
        }

        if (currentStatus === "expired") {
            return errorResult(410, "attempt_expired", "This conversion attempt has expired. Please start again.", {
                attemptId: parsed.attemptId,
                status: "expired",
            })
        }

        return errorResult(
            409,
            "invalid_status",
            `Client conversion cannot fail from status "${currentStatus ?? "unknown"}".`,
            { attemptId: parsed.attemptId },
        )
    } catch (error) {
        requestLogger.error({ attemptId: parsed.attemptId, err: error }, "Failed to record failed client conversion")
        return errorResult(
            500,
            "client_conversion_unavailable",
            "Unable to record the failed client conversion right now. Please try again.",
            { attemptId: parsed.attemptId },
        )
    }
}

export async function handleClientConversionFailHttpRequest(request: Request, peerIp?: string): Promise<Response> {
    const requestContext = await getClientConversionFailRequestContext()
    const requestId = resolveRequestId(request)
    const result = await processClientConversionFail(
        await request.json(),
        requestContext.resolveClientIpFromRequest(request, peerIp),
        { requestId },
    )

    return Response.json(result.body, {
        status: result.status,
        headers: withRequestIdHeader(requestId),
    })
}

export const failClientConversion = createServerFn({ method: "POST" }).handler(async ({ data }) => {
    const requestContext = await getClientConversionFailRequestContext()
    const result = await processClientConversionFail(data, requestContext.resolveClientIp())
    requestContext.setResponseStatus(result.status)
    return result.body
})
