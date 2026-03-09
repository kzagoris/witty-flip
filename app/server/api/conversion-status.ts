import { createServerFn, createServerOnlyFn } from "@tanstack/react-start"
import {
    errorResult,
    isRecord,
    type ApiErrorResponse,
    type ApiResult,
    type ConversionStatusResponse,
} from "./contracts"

interface ConversionStatusServerDeps {
    eq: typeof import("drizzle-orm").eq
    db: typeof import("~/lib/db").db
    conversions: typeof import("~/lib/db/schema").conversions
    checkAndConsumeRequestRateLimit: typeof import("~/lib/request-rate-limit").checkAndConsumeRequestRateLimit
    STATUS_REQUESTS_PER_MINUTE_LIMIT: typeof import("~/lib/request-rate-limit").STATUS_REQUESTS_PER_MINUTE_LIMIT
    initializeServerRuntime: typeof import("~/lib/server-runtime").initializeServerRuntime
    buildConversionStatusPayload: typeof import("./status-utils").buildConversionStatusPayload
}

let conversionStatusServerDepsPromise: Promise<ConversionStatusServerDeps> | undefined

const getConversionStatusServerDeps = createServerOnlyFn(async (): Promise<ConversionStatusServerDeps> => {
    conversionStatusServerDepsPromise ??= Promise.all([
        import("drizzle-orm"),
        import("~/lib/db"),
        import("~/lib/db/schema"),
        import("~/lib/request-rate-limit"),
        import("~/lib/server-runtime"),
        import("./status-utils"),
    ]).then(
        ([
            drizzleOrmModule,
            dbModule,
            schemaModule,
            requestRateLimitModule,
            serverRuntimeModule,
            statusUtilsModule,
        ]) => ({
            eq: drizzleOrmModule.eq,
            db: dbModule.db,
            conversions: schemaModule.conversions,
            checkAndConsumeRequestRateLimit: requestRateLimitModule.checkAndConsumeRequestRateLimit,
            STATUS_REQUESTS_PER_MINUTE_LIMIT: requestRateLimitModule.STATUS_REQUESTS_PER_MINUTE_LIMIT,
            initializeServerRuntime: serverRuntimeModule.initializeServerRuntime,
            buildConversionStatusPayload: statusUtilsModule.buildConversionStatusPayload,
        }),
    )

    return conversionStatusServerDepsPromise
})

interface ConversionStatusRequestContextDeps {
    setResponseStatus: typeof import("@tanstack/react-start/server").setResponseStatus
    resolveClientIp: typeof import("~/lib/request-ip").resolveClientIp
    resolveClientIpFromRequest: typeof import("~/lib/request-ip").resolveClientIpFromRequest
}

let conversionStatusRequestContextPromise: Promise<ConversionStatusRequestContextDeps> | undefined

const getConversionStatusRequestContext = createServerOnlyFn(async (): Promise<ConversionStatusRequestContextDeps> => {
    conversionStatusRequestContextPromise ??= Promise.all([
        import("@tanstack/react-start/server"),
        import("~/lib/request-ip"),
    ]).then(([serverModule, requestIpModule]) => ({
        setResponseStatus: serverModule.setResponseStatus,
        resolveClientIp: requestIpModule.resolveClientIp,
        resolveClientIpFromRequest: requestIpModule.resolveClientIpFromRequest,
    }))

    return conversionStatusRequestContextPromise
})

function parseFileIdInput(data: unknown): string | undefined {
    if (!isRecord(data) || typeof data["fileId"] !== "string") {
        return undefined
    }

    const fileId = data["fileId"].trim()
    return fileId.length > 0 ? fileId : undefined
}

export async function processConversionStatus(
    data: unknown,
    clientIp: string,
): Promise<ApiResult<ConversionStatusResponse | ApiErrorResponse>> {
    const {
        eq,
        db,
        conversions,
        checkAndConsumeRequestRateLimit,
        STATUS_REQUESTS_PER_MINUTE_LIMIT,
        initializeServerRuntime,
        buildConversionStatusPayload,
    } = await getConversionStatusServerDeps()

    initializeServerRuntime()

    const requestLimit = checkAndConsumeRequestRateLimit(clientIp, Date.now(), {
        bucketKey: "status",
        limit: STATUS_REQUESTS_PER_MINUTE_LIMIT,
    })
    if (!requestLimit.allowed) {
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

    return {
        status: 200,
        body: await buildConversionStatusPayload(conversion),
    }
}

export async function handleConversionStatusHttpRequest(
    request: Request,
    fileId: string,
    peerIp?: string,
): Promise<Response> {
    const { resolveClientIpFromRequest } = await getConversionStatusRequestContext()

    const result = await processConversionStatus({ fileId }, resolveClientIpFromRequest(request, peerIp))
    return Response.json(result.body, { status: result.status })
}

export const getConversionStatus = createServerFn({ method: "GET" }).handler(async ({ data }) => {
    const { setResponseStatus, resolveClientIp } = await getConversionStatusRequestContext()

    const result = await processConversionStatus(data, resolveClientIp())
    setResponseStatus(result.status)
    return result.body
})
