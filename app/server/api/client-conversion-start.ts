import { createServerFn, createServerOnlyFn } from "@tanstack/react-start"
import { resolveRequestId, withRequestIdHeader } from "~/lib/observability"
import { createRequestLogger } from "~/lib/server-observability"
import {
    errorResult,
    isRecord,
    parseOptionalNonNegativeInteger,
    type ApiErrorResponse,
    type ApiResult,
    type ClientConversionInputMode,
    type ClientConversionStartResponse,
} from "./contracts"

interface ClientConversionStartServerDeps {
    db: typeof import("~/lib/db").db
    clientConversionAttempts: typeof import("~/lib/db/schema").clientConversionAttempts
    getClientConversionBySlug: typeof import("~/lib/conversions").getClientConversionBySlug
    createClientAttemptId: typeof import("~/lib/client-conversion-attempts").createClientAttemptId
    createClientAttemptToken: typeof import("~/lib/client-conversion-attempts").createClientAttemptToken
    getClientAttemptExpiresAt: typeof import("~/lib/client-conversion-attempts").getClientAttemptExpiresAt
    getClientAttemptRecoveryCookieName: typeof import("~/lib/client-conversion-attempts").getClientAttemptRecoveryCookieName
    hashClientAttemptToken: typeof import("~/lib/client-conversion-attempts").hashClientAttemptToken
    reserveRateLimitSlot: typeof import("~/lib/rate-limit").reserveRateLimitSlot
    signClientAttemptRecoveryCookie: typeof import("~/lib/client-conversion-attempts").signClientAttemptRecoveryCookie
    checkAndConsumeRequestRateLimit: typeof import("~/lib/request-rate-limit").checkAndConsumeRequestRateLimit
    CLIENT_CONVERSION_REQUESTS_PER_MINUTE_LIMIT: typeof import("~/lib/request-rate-limit").CLIENT_CONVERSION_REQUESTS_PER_MINUTE_LIMIT
    initializeServerRuntime: typeof import("~/lib/server-runtime").initializeServerRuntime
}

let clientConversionStartServerDepsPromise: Promise<ClientConversionStartServerDeps> | undefined

const getClientConversionStartServerDeps = createServerOnlyFn(async (): Promise<ClientConversionStartServerDeps> => {
    clientConversionStartServerDepsPromise ??= Promise.all([
        import("~/lib/db"),
        import("~/lib/db/schema"),
        import("~/lib/conversions"),
        import("~/lib/client-conversion-attempts"),
        import("~/lib/rate-limit"),
        import("~/lib/request-rate-limit"),
        import("~/lib/server-runtime"),
    ]).then(
        ([
            dbModule,
            schemaModule,
            conversionsModule,
            clientConversionAttemptsModule,
            rateLimitModule,
            requestRateLimitModule,
            serverRuntimeModule,
        ]) => ({
            db: dbModule.db,
            clientConversionAttempts: schemaModule.clientConversionAttempts,
            getClientConversionBySlug: conversionsModule.getClientConversionBySlug,
            createClientAttemptId: clientConversionAttemptsModule.createClientAttemptId,
            createClientAttemptToken: clientConversionAttemptsModule.createClientAttemptToken,
            getClientAttemptExpiresAt: clientConversionAttemptsModule.getClientAttemptExpiresAt,
            getClientAttemptRecoveryCookieName: clientConversionAttemptsModule.getClientAttemptRecoveryCookieName,
            hashClientAttemptToken: clientConversionAttemptsModule.hashClientAttemptToken,
            reserveRateLimitSlot: rateLimitModule.reserveRateLimitSlot,
            signClientAttemptRecoveryCookie: clientConversionAttemptsModule.signClientAttemptRecoveryCookie,
            checkAndConsumeRequestRateLimit: requestRateLimitModule.checkAndConsumeRequestRateLimit,
            CLIENT_CONVERSION_REQUESTS_PER_MINUTE_LIMIT:
                requestRateLimitModule.CLIENT_CONVERSION_REQUESTS_PER_MINUTE_LIMIT,
            initializeServerRuntime: serverRuntimeModule.initializeServerRuntime,
        }),
    )

    return clientConversionStartServerDepsPromise
})

interface ClientConversionStartRequestContextDeps {
    setResponseHeaders: typeof import("@tanstack/react-start/server").setResponseHeaders
    setResponseStatus: typeof import("@tanstack/react-start/server").setResponseStatus
    resolveClientIp: typeof import("~/lib/request-ip").resolveClientIp
    resolveClientIpFromRequest: typeof import("~/lib/request-ip").resolveClientIpFromRequest
}

let clientConversionStartRequestContextPromise: Promise<ClientConversionStartRequestContextDeps> | undefined

const getClientConversionStartRequestContext = createServerOnlyFn(
    async (): Promise<ClientConversionStartRequestContextDeps> => {
        clientConversionStartRequestContextPromise ??= Promise.all([
            import("@tanstack/react-start/server"),
            import("~/lib/request-ip"),
        ]).then(([serverModule, requestIpModule]) => ({
            setResponseHeaders: serverModule.setResponseHeaders,
            setResponseStatus: serverModule.setResponseStatus,
            resolveClientIp: requestIpModule.resolveClientIp,
            resolveClientIpFromRequest: requestIpModule.resolveClientIpFromRequest,
        }))

        return clientConversionStartRequestContextPromise
    },
)

interface ParsedClientConversionStartRequest {
    conversionSlug: string
    fileSizeBytes?: number
    inputMode: ClientConversionInputMode
    originalFilename?: string
}

function parseOptionalString(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined
    }

    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
}

function parseClientConversionStartInput(
    data: unknown,
): ParsedClientConversionStartRequest | ApiResult<ApiErrorResponse> {
    if (!isRecord(data)) {
        return errorResult(400, "invalid_request", "A valid client conversion start request is required.")
    }

    const conversionSlug = parseOptionalString(data["conversionSlug"])
    if (!conversionSlug) {
        return errorResult(400, "invalid_conversion_type", "A valid conversionSlug is required.")
    }

    const inputMode = parseOptionalString(data["inputMode"])
    if (inputMode !== "file" && inputMode !== "paste") {
        return errorResult(400, "invalid_input_mode", 'inputMode must be either "file" or "paste".')
    }

    if (data["fileSizeBytes"] !== undefined && parseOptionalNonNegativeInteger(data["fileSizeBytes"]) === undefined) {
        return errorResult(400, "invalid_file_size", "fileSizeBytes must be a non-negative integer.")
    }

    return {
        conversionSlug,
        inputMode,
        originalFilename: parseOptionalString(data["originalFilename"]),
        fileSizeBytes: parseOptionalNonNegativeInteger(data["fileSizeBytes"]),
    }
}

function hasStartAttemptId(body: unknown): body is ClientConversionStartResponse {
    return isRecord(body) && typeof body["attemptId"] === "string"
}

function buildRecoveryCookieHeader(
    attemptId: string,
    deps: Pick<
        ClientConversionStartServerDeps,
        "getClientAttemptRecoveryCookieName" | "signClientAttemptRecoveryCookie"
    >,
): string {
    const cookieName = deps.getClientAttemptRecoveryCookieName(attemptId)
    const cookieValue = encodeURIComponent(deps.signClientAttemptRecoveryCookie(attemptId))
    return `${cookieName}=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Lax`
}

export async function processClientConversionStart(
    data: unknown,
    clientIp: string,
    context: { requestId?: string } = {},
): Promise<ApiResult<ClientConversionStartResponse | ApiErrorResponse>> {
    const {
        db,
        clientConversionAttempts,
        getClientConversionBySlug,
        createClientAttemptId,
        createClientAttemptToken,
        getClientAttemptExpiresAt,
        hashClientAttemptToken,
        reserveRateLimitSlot,
        checkAndConsumeRequestRateLimit,
        CLIENT_CONVERSION_REQUESTS_PER_MINUTE_LIMIT,
        initializeServerRuntime,
    } = await getClientConversionStartServerDeps()

    initializeServerRuntime()
    const requestId = context.requestId ?? resolveRequestId()
    const requestLogger = createRequestLogger("/api/client-conversion/start", requestId, { clientIp })

    const requestLimit = checkAndConsumeRequestRateLimit(clientIp, Date.now(), {
        bucketKey: "client-conversion",
        limit: CLIENT_CONVERSION_REQUESTS_PER_MINUTE_LIMIT,
    })
    if (!requestLimit.allowed) {
        requestLogger.warn({
            limit: requestLimit.limit,
            remaining: requestLimit.remaining,
            resetAt: requestLimit.resetAt,
        }, "Client conversion start request throttled")
        return errorResult(429, "request_rate_limited", "Too many requests. Please wait a minute and try again.", {
            limit: requestLimit.limit,
            remaining: requestLimit.remaining,
            resetAt: requestLimit.resetAt,
        })
    }

    const parsed = parseClientConversionStartInput(data)
    if ("status" in parsed && "body" in parsed) {
        return parsed
    }

    const conversion = getClientConversionBySlug(parsed.conversionSlug)
    if (!conversion) {
        return errorResult(400, "invalid_conversion_type", "The requested conversion type is not supported.")
    }

    const attemptId = createClientAttemptId()
    const token = createClientAttemptToken()
    const expiresAt = getClientAttemptExpiresAt()

    try {
        const reservation = await db.transaction(async (tx) => {
            const nextReservation = await reserveRateLimitSlot(clientIp, undefined, tx)

            await tx.insert(clientConversionAttempts).values({
                id: attemptId,
                conversionType: conversion.slug,
                category: conversion.category,
                ipAddress: clientIp,
                inputMode: parsed.inputMode,
                originalFilename: parsed.originalFilename,
                inputSizeBytes: parsed.fileSizeBytes,
                tokenHash: hashClientAttemptToken(token),
                rateLimitDate: nextReservation.allowed ? nextReservation.rateLimitDate : null,
                status: nextReservation.allowed ? "reserved" : "payment_required",
                expiresAt,
            })

            return nextReservation
        })

        if (!reservation.allowed) {
            requestLogger.info({ attemptId, conversionSlug: conversion.slug }, "Client conversion requires payment")
            return {
                status: 200,
                body: {
                    allowed: false,
                    attemptId,
                    requiresPayment: true,
                    processingMode: "client",
                    status: "payment_required",
                },
            }
        }

        requestLogger.info({
            attemptId,
            conversionSlug: conversion.slug,
            remainingFreeAfterReservation: reservation.remaining,
        }, "Created client conversion attempt")
        return {
            status: 200,
            body: {
                allowed: true,
                attemptId,
                token,
                processingMode: "client",
                status: "reserved",
                remainingFreeAfterReservation: reservation.remaining,
            },
        }
    } catch (error) {
        requestLogger.error({ attemptId, err: error }, "Failed to create client conversion attempt")
        return errorResult(
            500,
            "client_conversion_unavailable",
            "Unable to start the client conversion right now. Please try again.",
        )
    }
}

export async function handleClientConversionStartHttpRequest(request: Request, peerIp?: string): Promise<Response> {
    const [requestContext, serverDeps] = await Promise.all([
        getClientConversionStartRequestContext(),
        getClientConversionStartServerDeps(),
    ])

    const requestId = resolveRequestId(request)
    const result = await processClientConversionStart(
        await request.json(),
        requestContext.resolveClientIpFromRequest(request, peerIp),
        { requestId },
    )
    const headers = withRequestIdHeader(requestId)

    if (result.status === 200 && hasStartAttemptId(result.body)) {
        headers.append("set-cookie", buildRecoveryCookieHeader(result.body.attemptId, serverDeps))
    }

    return Response.json(result.body, { status: result.status, headers })
}

export const startClientConversion = createServerFn({ method: "POST" }).handler(async ({ data }) => {
    const [requestContext, serverDeps] = await Promise.all([
        getClientConversionStartRequestContext(),
        getClientConversionStartServerDeps(),
    ])

    const result = await processClientConversionStart(data, requestContext.resolveClientIp())
    requestContext.setResponseStatus(result.status)

    if (result.status === 200 && hasStartAttemptId(result.body)) {
        const headers = new Headers()
        headers.append("set-cookie", buildRecoveryCookieHeader(result.body.attemptId, serverDeps))
        requestContext.setResponseHeaders(headers)
    }

    return result.body
})
