import { createServerFn, createServerOnlyFn } from "@tanstack/react-start"
import { resolveRequestId, withRequestIdHeader } from "~/lib/observability"
import { createRequestLogger } from "~/lib/server-observability"
import {
    errorResult,
    isRecord,
    parseOptionalNonNegativeInteger,
    type ApiErrorResponse,
    type ApiResult,
    type ClientConversionCompleteRequest,
    type ClientConversionCompleteResponse,
} from "./contracts"

interface ClientConversionCompleteServerDeps {
    and: typeof import("drizzle-orm").and
    eq: typeof import("drizzle-orm").eq
    inArray: typeof import("drizzle-orm").inArray
    db: typeof import("~/lib/db").db
    clientConversionAttempts: typeof import("~/lib/db/schema").clientConversionAttempts
    consumeRateLimitSlot: typeof import("~/lib/rate-limit").consumeRateLimitSlot
    hashClientAttemptToken: typeof import("~/lib/client-conversion-attempts").hashClientAttemptToken
    isClientAttemptExpired: typeof import("~/lib/client-conversion-attempts").isClientAttemptExpired
    checkAndConsumeRequestRateLimit: typeof import("~/lib/request-rate-limit").checkAndConsumeRequestRateLimit
    CLIENT_CONVERSION_REQUESTS_PER_MINUTE_LIMIT: typeof import("~/lib/request-rate-limit").CLIENT_CONVERSION_REQUESTS_PER_MINUTE_LIMIT
    initializeServerRuntime: typeof import("~/lib/server-runtime").initializeServerRuntime
}

let clientConversionCompleteServerDepsPromise: Promise<ClientConversionCompleteServerDeps> | undefined

const getClientConversionCompleteServerDeps = createServerOnlyFn(
    async (): Promise<ClientConversionCompleteServerDeps> => {
        clientConversionCompleteServerDepsPromise ??= Promise.all([
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
                consumeRateLimitSlot: rateLimitModule.consumeRateLimitSlot,
                hashClientAttemptToken: clientConversionAttemptsModule.hashClientAttemptToken,
                isClientAttemptExpired: clientConversionAttemptsModule.isClientAttemptExpired,
                checkAndConsumeRequestRateLimit: requestRateLimitModule.checkAndConsumeRequestRateLimit,
                CLIENT_CONVERSION_REQUESTS_PER_MINUTE_LIMIT:
                    requestRateLimitModule.CLIENT_CONVERSION_REQUESTS_PER_MINUTE_LIMIT,
                initializeServerRuntime: serverRuntimeModule.initializeServerRuntime,
            }),
        )

        return clientConversionCompleteServerDepsPromise
    },
)

interface ClientConversionCompleteRequestContextDeps {
    setResponseStatus: typeof import("@tanstack/react-start/server").setResponseStatus
    resolveClientIp: typeof import("~/lib/request-ip").resolveClientIp
    resolveClientIpFromRequest: typeof import("~/lib/request-ip").resolveClientIpFromRequest
}

let clientConversionCompleteRequestContextPromise: Promise<ClientConversionCompleteRequestContextDeps> | undefined

const getClientConversionCompleteRequestContext = createServerOnlyFn(
    async (): Promise<ClientConversionCompleteRequestContextDeps> => {
        clientConversionCompleteRequestContextPromise ??= Promise.all([
            import("@tanstack/react-start/server"),
            import("~/lib/request-ip"),
        ]).then(([serverModule, requestIpModule]) => ({
            setResponseStatus: serverModule.setResponseStatus,
            resolveClientIp: requestIpModule.resolveClientIp,
            resolveClientIpFromRequest: requestIpModule.resolveClientIpFromRequest,
        }))

        return clientConversionCompleteRequestContextPromise
    },
)

function parseClientConversionCompleteInput(
    data: unknown,
): ClientConversionCompleteRequest | ApiResult<ApiErrorResponse> {
    if (!isRecord(data)) {
        return errorResult(400, "invalid_request", "A valid client conversion completion request is required.")
    }

    const attemptId = typeof data["attemptId"] === "string" ? data["attemptId"].trim() : ""
    if (!attemptId) {
        return errorResult(400, "invalid_attempt_id", "A valid attemptId is required.")
    }

    const token = typeof data["token"] === "string" ? data["token"].trim() : ""
    if (!token) {
        return errorResult(400, "invalid_token", "A valid token is required.")
    }

    const outputFilename = typeof data["outputFilename"] === "string" ? data["outputFilename"].trim() : ""
    if (!outputFilename) {
        return errorResult(400, "invalid_output_filename", "A valid outputFilename is required.")
    }

    const outputMimeType = typeof data["outputMimeType"] === "string" ? data["outputMimeType"].trim() : ""
    if (!outputMimeType) {
        return errorResult(400, "invalid_output_mime_type", "A valid outputMimeType is required.")
    }

    if (data["outputSizeBytes"] !== undefined && parseOptionalNonNegativeInteger(data["outputSizeBytes"]) === undefined) {
        return errorResult(400, "invalid_output_size", "outputSizeBytes must be a non-negative integer.")
    }

    if (data["durationMs"] !== undefined && parseOptionalNonNegativeInteger(data["durationMs"]) === undefined) {
        return errorResult(400, "invalid_duration", "durationMs must be a non-negative integer.")
    }

    return {
        attemptId,
        token,
        outputFilename,
        outputMimeType,
        outputSizeBytes: parseOptionalNonNegativeInteger(data["outputSizeBytes"]),
        durationMs: parseOptionalNonNegativeInteger(data["durationMs"]),
    }
}

export async function processClientConversionComplete(
    data: unknown,
    clientIp: string,
    context: { requestId?: string } = {},
): Promise<ApiResult<ClientConversionCompleteResponse | ApiErrorResponse>> {
    const {
        and,
        eq,
        inArray,
        db,
        clientConversionAttempts,
        consumeRateLimitSlot,
        hashClientAttemptToken,
        isClientAttemptExpired,
        checkAndConsumeRequestRateLimit,
        CLIENT_CONVERSION_REQUESTS_PER_MINUTE_LIMIT,
        initializeServerRuntime,
    } = await getClientConversionCompleteServerDeps()

    initializeServerRuntime()
    const requestId = context.requestId ?? resolveRequestId()
    const requestLogger = createRequestLogger("/api/client-conversion/complete", requestId, { clientIp })

    const requestLimit = checkAndConsumeRequestRateLimit(clientIp, Date.now(), {
        bucketKey: "client-conversion",
        limit: CLIENT_CONVERSION_REQUESTS_PER_MINUTE_LIMIT,
    })
    if (!requestLimit.allowed) {
        requestLogger.warn({
            limit: requestLimit.limit,
            remaining: requestLimit.remaining,
            resetAt: requestLimit.resetAt,
        }, "Client conversion complete request throttled")
        return errorResult(429, "request_rate_limited", "Too many requests. Please wait a minute and try again.", {
            limit: requestLimit.limit,
            remaining: requestLimit.remaining,
            resetAt: requestLimit.resetAt,
        })
    }

    const parsed = parseClientConversionCompleteInput(data)
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

    if (attempt.status === "expired" || isClientAttemptExpired(attempt.expiresAt)) {
        return errorResult(410, "attempt_expired", "This conversion attempt has expired. Please start again.", {
            attemptId: parsed.attemptId,
            status: "expired",
        })
    }

    const completedAt = new Date().toISOString()

    try {
        const completionResult = await db.transaction(async (tx) => {
            const updateResult = await tx
                .update(clientConversionAttempts)
                .set({
                    status: "completed",
                    outputFilename: parsed.outputFilename,
                    outputMimeType: parsed.outputMimeType,
                    outputSizeBytes: parsed.outputSizeBytes,
                    durationMs: parsed.durationMs,
                    errorCode: null,
                    errorMessage: null,
                    recoveryToken: null,
                    completedAt,
                })
                .where(and(
                    eq(clientConversionAttempts.id, parsed.attemptId),
                    inArray(clientConversionAttempts.status, ["reserved", "ready"]),
                ))

            if (updateResult.rowsAffected > 0) {
                if (attempt.wasPaid !== 1 && attempt.rateLimitDate) {
                    await consumeRateLimitSlot(attempt.ipAddress, attempt.rateLimitDate, tx)
                }

                return { recorded: true as const }
            }

            const currentAttempt = await tx.query.clientConversionAttempts.findFirst({
                where: eq(clientConversionAttempts.id, parsed.attemptId),
            })

            return { currentAttempt }
        })

        if ("recorded" in completionResult) {
            requestLogger.info({ attemptId: parsed.attemptId }, "Recorded completed client conversion")
            return {
                status: 200,
                body: { recorded: true },
            }
        }

        const currentStatus = completionResult.currentAttempt?.status
        if (currentStatus === "completed") {
            return {
                status: 200,
                body: { recorded: true },
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
            `Client conversion cannot complete from status "${currentStatus ?? "unknown"}".`,
            { attemptId: parsed.attemptId },
        )
    } catch (error) {
        requestLogger.error({ attemptId: parsed.attemptId, err: error }, "Failed to record completed client conversion")
        return errorResult(
            500,
            "client_conversion_unavailable",
            "Unable to record the completed client conversion right now. Please try again.",
            { attemptId: parsed.attemptId },
        )
    }
}

export async function handleClientConversionCompleteHttpRequest(
    request: Request,
    peerIp?: string,
): Promise<Response> {
    const requestContext = await getClientConversionCompleteRequestContext()
    const requestId = resolveRequestId(request)
    const result = await processClientConversionComplete(
        await request.json(),
        requestContext.resolveClientIpFromRequest(request, peerIp),
        { requestId },
    )

    return Response.json(result.body, {
        status: result.status,
        headers: withRequestIdHeader(requestId),
    })
}

export const completeClientConversion = createServerFn({ method: "POST" }).handler(async ({ data }) => {
    const requestContext = await getClientConversionCompleteRequestContext()
    const result = await processClientConversionComplete(data, requestContext.resolveClientIp())
    requestContext.setResponseStatus(result.status)
    return result.body
})
