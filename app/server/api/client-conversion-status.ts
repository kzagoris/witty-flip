import { createServerFn, createServerOnlyFn } from "@tanstack/react-start"
import { resolveRequestId, withRequestIdHeader } from "~/lib/observability"
import { createRequestLogger } from "~/lib/server-observability"
import {
    errorResult,
    isRecord,
    type ApiErrorResponse,
    type ApiResult,
    type ClientAttemptStatus,
    type ClientConversionStatusRequest,
    type ClientConversionStatusResponse,
} from "./contracts"

interface ClientConversionStatusServerDeps {
    and: typeof import("drizzle-orm").and
    eq: typeof import("drizzle-orm").eq
    inArray: typeof import("drizzle-orm").inArray
    db: typeof import("~/lib/db").db
    clientConversionAttempts: typeof import("~/lib/db/schema").clientConversionAttempts
    getClientAttemptRecoveryCookieName: typeof import("~/lib/client-conversion-attempts").getClientAttemptRecoveryCookieName
    hasValidClientAttemptRecoveryCookie: typeof import("~/lib/client-conversion-attempts").hasValidClientAttemptRecoveryCookie
    isClientAttemptExpired: typeof import("~/lib/client-conversion-attempts").isClientAttemptExpired
    normalizeClientAttemptStatus: typeof import("~/lib/client-conversion-attempts").normalizeClientAttemptStatus
    checkAndConsumeRequestRateLimit: typeof import("~/lib/request-rate-limit").checkAndConsumeRequestRateLimit
    CLIENT_CONVERSION_STATUS_REQUESTS_PER_MINUTE_LIMIT: typeof import("~/lib/request-rate-limit").CLIENT_CONVERSION_STATUS_REQUESTS_PER_MINUTE_LIMIT
    initializeServerRuntime: typeof import("~/lib/server-runtime").initializeServerRuntime
    reconcileClientPendingPayment: typeof import("~/lib/stripe").reconcileClientPendingPayment
    releaseRateLimitSlot: typeof import("~/lib/rate-limit").releaseRateLimitSlot
}

let clientConversionStatusServerDepsPromise: Promise<ClientConversionStatusServerDeps> | undefined

const getClientConversionStatusServerDeps = createServerOnlyFn(async (): Promise<ClientConversionStatusServerDeps> => {
    clientConversionStatusServerDepsPromise ??= Promise.all([
        import("drizzle-orm"),
        import("~/lib/db"),
        import("~/lib/db/schema"),
        import("~/lib/client-conversion-attempts"),
        import("~/lib/request-rate-limit"),
        import("~/lib/server-runtime"),
        import("~/lib/stripe"),
        import("~/lib/rate-limit"),
    ]).then(
        ([
            drizzleOrmModule,
            dbModule,
            schemaModule,
            clientConversionAttemptsModule,
            requestRateLimitModule,
            serverRuntimeModule,
            stripeModule,
            rateLimitModule,
        ]) => ({
            and: drizzleOrmModule.and,
            eq: drizzleOrmModule.eq,
            inArray: drizzleOrmModule.inArray,
            db: dbModule.db,
            clientConversionAttempts: schemaModule.clientConversionAttempts,
            getClientAttemptRecoveryCookieName: clientConversionAttemptsModule.getClientAttemptRecoveryCookieName,
            hasValidClientAttemptRecoveryCookie: clientConversionAttemptsModule.hasValidClientAttemptRecoveryCookie,
            isClientAttemptExpired: clientConversionAttemptsModule.isClientAttemptExpired,
            normalizeClientAttemptStatus: clientConversionAttemptsModule.normalizeClientAttemptStatus,
            checkAndConsumeRequestRateLimit: requestRateLimitModule.checkAndConsumeRequestRateLimit,
            CLIENT_CONVERSION_STATUS_REQUESTS_PER_MINUTE_LIMIT:
                requestRateLimitModule.CLIENT_CONVERSION_STATUS_REQUESTS_PER_MINUTE_LIMIT,
            initializeServerRuntime: serverRuntimeModule.initializeServerRuntime,
            reconcileClientPendingPayment: stripeModule.reconcileClientPendingPayment,
            releaseRateLimitSlot: rateLimitModule.releaseRateLimitSlot,
        }),
    )

    return clientConversionStatusServerDepsPromise
})

interface ClientConversionStatusRequestContextDeps {
    getRequest: typeof import("@tanstack/react-start/server").getRequest
    setResponseStatus: typeof import("@tanstack/react-start/server").setResponseStatus
    resolveClientIp: typeof import("~/lib/request-ip").resolveClientIp
    resolveClientIpFromRequest: typeof import("~/lib/request-ip").resolveClientIpFromRequest
}

let clientConversionStatusRequestContextPromise: Promise<ClientConversionStatusRequestContextDeps> | undefined

const getClientConversionStatusRequestContext = createServerOnlyFn(
    async (): Promise<ClientConversionStatusRequestContextDeps> => {
        clientConversionStatusRequestContextPromise ??= Promise.all([
            import("@tanstack/react-start/server"),
            import("~/lib/request-ip"),
        ]).then(([serverModule, requestIpModule]) => ({
            getRequest: serverModule.getRequest,
            setResponseStatus: serverModule.setResponseStatus,
            resolveClientIp: requestIpModule.resolveClientIp,
            resolveClientIpFromRequest: requestIpModule.resolveClientIpFromRequest,
        }))

        return clientConversionStatusRequestContextPromise
    },
)

interface ClientConversionAttemptRecord {
    id: string
    expiresAt: string
    errorCode: string | null
    errorMessage: string | null
    ipAddress: string
    rateLimitDate: string | null
    recoveryToken: string | null
    status: string
    wasPaid: number | null
}

function parseClientConversionStatusInput(
    data: unknown,
): ClientConversionStatusRequest | ApiResult<ApiErrorResponse> {
    if (!isRecord(data) || typeof data["attemptId"] !== "string") {
        return errorResult(400, "invalid_attempt_id", "A valid attemptId is required.")
    }

    const attemptId = data["attemptId"].trim()
    if (!attemptId) {
        return errorResult(400, "invalid_attempt_id", "A valid attemptId is required.")
    }

    return { attemptId }
}

function parseCookieHeader(cookieHeader: string | null | undefined): Map<string, string> {
    const cookies = new Map<string, string>()

    for (const segment of cookieHeader?.split(";") ?? []) {
        const [rawName, ...rawValue] = segment.split("=")
        const name = rawName?.trim()
        if (!name) continue

        let decoded: string
        try {
            decoded = decodeURIComponent(rawValue.join("=").trim())
        } catch {
            decoded = rawValue.join("=").trim()
        }
        cookies.set(name, decoded)
    }

    return cookies
}

function getClientConversionStatusMessage(
    status: ClientAttemptStatus,
    attempt: ClientConversionAttemptRecord,
    isExpired: boolean,
): string | undefined {
    if (isExpired || status === "expired") {
        return "This conversion attempt has expired. Please start again."
    }

    switch (status) {
        case "payment_required":
            return attempt.errorMessage ?? "Free daily limit reached. Complete payment to continue."
        case "pending_payment":
            return attempt.errorMessage ?? "Processing payment..."
        case "ready":
        case "reserved":
            return "Ready to convert."
        case "completed":
            return "Client conversion has been recorded."
        case "failed":
            return attempt.errorMessage ?? "Client conversion failed."
    }
}

function buildClientConversionStatusResponse(
    attempt: ClientConversionAttemptRecord,
    normalizeClientAttemptStatus: (value: string | null | undefined) => ClientAttemptStatus,
    isClientAttemptExpired: (expiresAt: string | null | undefined, now?: number) => boolean,
    token?: string,
): ClientConversionStatusResponse {
    const isExpired = isClientAttemptExpired(attempt.expiresAt)
    const normalizedStatus = isExpired ? "expired" : normalizeClientAttemptStatus(attempt.status)
    const statusMessage = getClientConversionStatusMessage(normalizedStatus, attempt, isExpired)

    return {
        attemptId: attempt.id,
        status: normalizedStatus,
        processingMode: "client",
        paid: attempt.wasPaid === 1,
        expiresAt: attempt.expiresAt,
        ...(token ? { token } : {}),
        ...(attempt.errorCode ? { errorCode: attempt.errorCode } : {}),
        ...(statusMessage ? { message: statusMessage } : {}),
    }
}

export async function processClientConversionStatus(
    data: unknown,
    clientIp: string,
    context: { cookieHeader?: string | null; requestId?: string } = {},
): Promise<ApiResult<ClientConversionStatusResponse | ApiErrorResponse>> {
    const {
        and,
        eq,
        inArray,
        db,
        clientConversionAttempts,
        getClientAttemptRecoveryCookieName,
        hasValidClientAttemptRecoveryCookie,
        isClientAttemptExpired,
        normalizeClientAttemptStatus,
        checkAndConsumeRequestRateLimit,
        CLIENT_CONVERSION_STATUS_REQUESTS_PER_MINUTE_LIMIT,
        initializeServerRuntime,
        reconcileClientPendingPayment,
        releaseRateLimitSlot,
    } = await getClientConversionStatusServerDeps()

    initializeServerRuntime()
    const requestId = context.requestId ?? resolveRequestId()
    const requestLogger = createRequestLogger("/api/client-conversion/status", requestId, { clientIp })

    const requestLimit = checkAndConsumeRequestRateLimit(clientIp, Date.now(), {
        bucketKey: "client-conversion-status",
        limit: CLIENT_CONVERSION_STATUS_REQUESTS_PER_MINUTE_LIMIT,
    })
    if (!requestLimit.allowed) {
        requestLogger.warn({
            limit: requestLimit.limit,
            remaining: requestLimit.remaining,
            resetAt: requestLimit.resetAt,
        }, "Client conversion status request throttled")
        return errorResult(429, "request_rate_limited", "Too many requests. Please wait a minute and try again.", {
            limit: requestLimit.limit,
            remaining: requestLimit.remaining,
            resetAt: requestLimit.resetAt,
        })
    }

    const parsed = parseClientConversionStatusInput(data)
    if ("status" in parsed && "body" in parsed) {
        return parsed
    }

    let attempt = await db.query.clientConversionAttempts.findFirst({
        where: eq(clientConversionAttempts.id, parsed.attemptId),
    })

    if (!attempt) {
        return errorResult(404, "not_found", "Client conversion attempt not found.", { attemptId: parsed.attemptId })
    }

    if (attempt.status === "pending_payment") {
        requestLogger.info({ attemptId: parsed.attemptId }, "Reconciling pending client payment during status request")
        await reconcileClientPendingPayment(parsed.attemptId)
        attempt = await db.query.clientConversionAttempts.findFirst({
            where: eq(clientConversionAttempts.id, parsed.attemptId),
        })

        if (!attempt) {
            return errorResult(404, "not_found", "Client conversion attempt not found.", { attemptId: parsed.attemptId })
        }
    }

    if (attempt.status !== "expired" && isClientAttemptExpired(attempt.expiresAt)) {
        try {
            await db.transaction(async (tx) => {
                const result = await tx
                    .update(clientConversionAttempts)
                    .set({ status: "expired", recoveryToken: null })
                    .where(and(
                        eq(clientConversionAttempts.id, attempt.id),
                        inArray(clientConversionAttempts.status, ["reserved", "ready", "payment_required", "pending_payment"]),
                    ))

                if (result.rowsAffected > 0
                    && attempt.status === "reserved"
                    && attempt.wasPaid === 0
                    && attempt.rateLimitDate) {
                    await releaseRateLimitSlot(attempt.ipAddress, attempt.rateLimitDate, tx)
                }
            })
        } catch (err) {
            requestLogger.warn({ attemptId: attempt.id, err }, "Failed opportunistic expiry persistence")
        }
    }

    const cookieName = getClientAttemptRecoveryCookieName(attempt.id)
    const cookieValue = parseCookieHeader(context.cookieHeader).get(cookieName)
    const ownsAttempt =
        attempt.ipAddress === clientIp
        || hasValidClientAttemptRecoveryCookie(attempt.id, cookieValue)

    let token: string | undefined

    if (attempt.status === "ready" && attempt.recoveryToken && ownsAttempt && !isClientAttemptExpired(attempt.expiresAt)) {
        token = await db.transaction(async (tx) => {
            const currentAttempt = await tx.query.clientConversionAttempts.findFirst({
                where: eq(clientConversionAttempts.id, attempt.id),
            })

            if (!currentAttempt || currentAttempt.status !== "ready" || !currentAttempt.recoveryToken) {
                return undefined
            }

            const updateResult = await tx
                .update(clientConversionAttempts)
                .set({ recoveryToken: null })
                .where(and(
                    eq(clientConversionAttempts.id, currentAttempt.id),
                    eq(clientConversionAttempts.status, "ready"),
                    eq(clientConversionAttempts.recoveryToken, currentAttempt.recoveryToken),
                ))

            return updateResult.rowsAffected > 0 ? currentAttempt.recoveryToken : undefined
        })

        if (token) {
            requestLogger.info({ attemptId: attempt.id }, "Released one-time recovery token for client conversion attempt")
        }
    }

    return {
        status: 200,
        body: buildClientConversionStatusResponse(attempt, normalizeClientAttemptStatus, isClientAttemptExpired, token),
    }
}

export async function handleClientConversionStatusHttpRequest(
    request: Request,
    peerIp?: string,
): Promise<Response> {
    const requestContext = await getClientConversionStatusRequestContext()
    const requestId = resolveRequestId(request)
    const attemptId = new URL(request.url).searchParams.get("attemptId")
    const result = await processClientConversionStatus(
        { attemptId },
        requestContext.resolveClientIpFromRequest(request, peerIp),
        {
            cookieHeader: request.headers.get("cookie"),
            requestId,
        },
    )

    return Response.json(result.body, {
        status: result.status,
        headers: withRequestIdHeader(requestId),
    })
}

export const getClientConversionStatus = createServerFn({ method: "GET" }).handler(async ({ data }) => {
    const requestContext = await getClientConversionStatusRequestContext()
    const result = await processClientConversionStatus(data, requestContext.resolveClientIp(), {
        cookieHeader: requestContext.getRequest().headers.get("cookie"),
        requestId: resolveRequestId(),
    })
    requestContext.setResponseStatus(result.status)
    return result.body
})
