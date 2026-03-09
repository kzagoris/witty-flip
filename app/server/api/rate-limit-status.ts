import { createServerFn, createServerOnlyFn } from "@tanstack/react-start"
import { errorResult, type ApiErrorResponse, type ApiResult, type RateLimitStatusResponse } from "./contracts"

interface RateLimitStatusServerDeps {
    checkRateLimit: typeof import("~/lib/rate-limit").checkRateLimit
    checkAndConsumeRequestRateLimit: typeof import("~/lib/request-rate-limit").checkAndConsumeRequestRateLimit
    initializeServerRuntime: typeof import("~/lib/server-runtime").initializeServerRuntime
}

let rateLimitStatusServerDepsPromise: Promise<RateLimitStatusServerDeps> | undefined

const getRateLimitStatusServerDeps = createServerOnlyFn(async (): Promise<RateLimitStatusServerDeps> => {
    rateLimitStatusServerDepsPromise ??= Promise.all([
        import("~/lib/rate-limit"),
        import("~/lib/request-rate-limit"),
        import("~/lib/server-runtime"),
    ]).then(([rateLimitModule, requestRateLimitModule, serverRuntimeModule]) => ({
        checkRateLimit: rateLimitModule.checkRateLimit,
        checkAndConsumeRequestRateLimit: requestRateLimitModule.checkAndConsumeRequestRateLimit,
        initializeServerRuntime: serverRuntimeModule.initializeServerRuntime,
    }))

    return rateLimitStatusServerDepsPromise
})

interface RateLimitStatusRequestContextDeps {
    setResponseStatus: typeof import("@tanstack/react-start/server").setResponseStatus
    resolveClientIp: typeof import("~/lib/request-ip").resolveClientIp
    resolveClientIpFromRequest: typeof import("~/lib/request-ip").resolveClientIpFromRequest
}

let rateLimitStatusRequestContextPromise: Promise<RateLimitStatusRequestContextDeps> | undefined

const getRateLimitStatusRequestContext = createServerOnlyFn(async (): Promise<RateLimitStatusRequestContextDeps> => {
    rateLimitStatusRequestContextPromise ??= Promise.all([
        import("@tanstack/react-start/server"),
        import("~/lib/request-ip"),
    ]).then(([serverModule, requestIpModule]) => ({
        setResponseStatus: serverModule.setResponseStatus,
        resolveClientIp: requestIpModule.resolveClientIp,
        resolveClientIpFromRequest: requestIpModule.resolveClientIpFromRequest,
    }))

    return rateLimitStatusRequestContextPromise
})

export async function processRateLimitStatus(
    clientIp: string,
): Promise<ApiResult<RateLimitStatusResponse | ApiErrorResponse>> {
    const { checkRateLimit, checkAndConsumeRequestRateLimit, initializeServerRuntime } =
        await getRateLimitStatusServerDeps()

    initializeServerRuntime()

    const requestLimit = checkAndConsumeRequestRateLimit(clientIp)
    if (!requestLimit.allowed) {
        return errorResult(429, "request_rate_limited", "Too many requests. Please wait a minute and try again.", {
            limit: requestLimit.limit,
            remaining: requestLimit.remaining,
            resetAt: requestLimit.resetAt,
        })
    }

    const rateLimit = await checkRateLimit(clientIp)
    return {
        status: 200,
        body: {
            remaining: rateLimit.remaining,
            limit: rateLimit.limit,
            resetAt: rateLimit.resetAt,
        },
    }
}

export async function handleRateLimitStatusHttpRequest(request: Request, peerIp?: string): Promise<Response> {
    const { resolveClientIpFromRequest } = await getRateLimitStatusRequestContext()

    const result = await processRateLimitStatus(resolveClientIpFromRequest(request, peerIp))
    return Response.json(result.body, { status: result.status })
}

export const getRateLimitStatus = createServerFn({ method: "GET" }).handler(async () => {
    const { setResponseStatus, resolveClientIp } = await getRateLimitStatusRequestContext()

    const result = await processRateLimitStatus(resolveClientIp())
    setResponseStatus(result.status)
    return result.body
})
