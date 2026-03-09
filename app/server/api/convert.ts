import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import {
  errorResult,
  isRecord,
  normalizeConversionStatus,
  type ApiErrorResponse,
  type ApiResult,
  type ConversionStatusResponse,
} from './contracts'

interface ConvertServerDeps {
  eq: typeof import('drizzle-orm').eq
  db: typeof import('~/lib/db').db
  conversions: typeof import('~/lib/db/schema').conversions
  checkRateLimit: typeof import('~/lib/rate-limit').checkRateLimit
  releaseRateLimitSlot: typeof import('~/lib/rate-limit').releaseRateLimitSlot
  reserveRateLimitSlot: typeof import('~/lib/rate-limit').reserveRateLimitSlot
  checkAndConsumeRequestRateLimit: typeof import('~/lib/request-rate-limit').checkAndConsumeRequestRateLimit
  initializeServerRuntime: typeof import('~/lib/server-runtime').initializeServerRuntime
  enqueueJob: typeof import('~/lib/queue').enqueueJob
  buildConversionStatusPayload: typeof import('./status-utils').buildConversionStatusPayload
}

let convertServerDepsPromise: Promise<ConvertServerDeps> | undefined

const getConvertServerDeps = createServerOnlyFn(async (): Promise<ConvertServerDeps> => {
  convertServerDepsPromise ??= Promise.all([
    import('drizzle-orm'),
    import('~/lib/db'),
    import('~/lib/db/schema'),
    import('~/lib/rate-limit'),
    import('~/lib/request-rate-limit'),
    import('~/lib/server-runtime'),
    import('~/lib/queue'),
    import('./status-utils'),
  ]).then(([
    drizzleOrmModule,
    dbModule,
    schemaModule,
    rateLimitModule,
    requestRateLimitModule,
    serverRuntimeModule,
    queueModule,
    statusUtilsModule,
  ]) => ({
    eq: drizzleOrmModule.eq,
    db: dbModule.db,
    conversions: schemaModule.conversions,
    checkRateLimit: rateLimitModule.checkRateLimit,
    releaseRateLimitSlot: rateLimitModule.releaseRateLimitSlot,
    reserveRateLimitSlot: rateLimitModule.reserveRateLimitSlot,
    checkAndConsumeRequestRateLimit: requestRateLimitModule.checkAndConsumeRequestRateLimit,
    initializeServerRuntime: serverRuntimeModule.initializeServerRuntime,
    enqueueJob: queueModule.enqueueJob,
    buildConversionStatusPayload: statusUtilsModule.buildConversionStatusPayload,
  }))

  return convertServerDepsPromise
})

interface ConvertRequestContextDeps {
  setResponseStatus: typeof import('@tanstack/react-start/server').setResponseStatus
  resolveClientIp: typeof import('~/lib/request-ip').resolveClientIp
  resolveClientIpFromRequest: typeof import('~/lib/request-ip').resolveClientIpFromRequest
}

let convertRequestContextPromise: Promise<ConvertRequestContextDeps> | undefined

const getConvertRequestContext = createServerOnlyFn(async (): Promise<ConvertRequestContextDeps> => {
  convertRequestContextPromise ??= Promise.all([
    import('@tanstack/react-start/server'),
    import('~/lib/request-ip'),
  ]).then(([serverModule, requestIpModule]) => ({
    setResponseStatus: serverModule.setResponseStatus,
    resolveClientIp: requestIpModule.resolveClientIp,
    resolveClientIpFromRequest: requestIpModule.resolveClientIpFromRequest,
  }))

  return convertRequestContextPromise
})

function parseFileIdInput(data: unknown): string | undefined {
  if (!isRecord(data) || typeof data['fileId'] !== 'string') {
    return undefined
  }

  const fileId = data['fileId'].trim()
  return fileId.length > 0 ? fileId : undefined
}

export async function processConvert(
  data: unknown,
  clientIp: string,
): Promise<ApiResult<ConversionStatusResponse | ApiErrorResponse>> {
  const {
    eq,
    db,
    conversions,
    checkRateLimit,
    releaseRateLimitSlot,
    reserveRateLimitSlot,
    checkAndConsumeRequestRateLimit,
    initializeServerRuntime,
    enqueueJob,
    buildConversionStatusPayload,
  } = await getConvertServerDeps()

  initializeServerRuntime()

  const requestLimit = checkAndConsumeRequestRateLimit(clientIp)
  if (!requestLimit.allowed) {
    return errorResult(429, 'request_rate_limited', 'Too many requests. Please wait a minute and try again.', {
      limit: requestLimit.limit,
      remaining: requestLimit.remaining,
      resetAt: requestLimit.resetAt,
    })
  }

  const fileId = parseFileIdInput(data)
  if (!fileId) {
    return errorResult(400, 'invalid_file_id', 'A valid fileId is required.')
  }

  const conversion = await db.query.conversions.findFirst({
    where: eq(conversions.id, fileId),
  })

  if (!conversion) {
    return errorResult(404, 'not_found', 'Conversion not found.', { fileId })
  }

  const conversionStatus = normalizeConversionStatus(conversion.status)

  if (conversionStatus === 'payment_required') {
    const limit = await checkRateLimit(clientIp)
    return errorResult(
      402,
      'payment_required',
      'Free daily limit reached. Complete payment to continue.',
      {
        fileId,
        status: 'payment_required',
        remaining: limit.remaining,
        limit: limit.limit,
        resetAt: limit.resetAt,
      },
    )
  }

  if (
    conversionStatus === 'queued'
    || conversionStatus === 'converting'
    || conversionStatus === 'completed'
    || conversionStatus === 'expired'
    || conversionStatus === 'pending_payment'
    || conversionStatus === 'failed'
    || conversionStatus === 'timeout'
  ) {
    return {
      status: 200,
      body: await buildConversionStatusPayload(conversion),
    }
  }

  if (conversionStatus !== 'uploaded') {
    const rawStatus = conversion.status ?? 'unknown'
    return errorResult(
      409,
      'invalid_status',
      `Conversion cannot start from status "${rawStatus}".`,
      { fileId },
    )
  }

  const reservation = await reserveRateLimitSlot(clientIp)
  if (!reservation.allowed) {
    await db
      .update(conversions)
      .set({
        status: 'payment_required',
        ipAddress: clientIp,
        rateLimitDate: null,
      })
      .where(eq(conversions.id, fileId))

    return errorResult(
      402,
      'payment_required',
      'Free daily limit reached. Complete payment to continue.',
      {
        fileId,
        status: 'payment_required',
        remaining: reservation.remaining,
        limit: reservation.limit,
        resetAt: reservation.resetAt,
      },
    )
  }

  try {
    await db
      .update(conversions)
      .set({
        ipAddress: clientIp,
        rateLimitDate: reservation.rateLimitDate,
      })
      .where(eq(conversions.id, fileId))

    await enqueueJob(fileId)
  } catch {
    await releaseRateLimitSlot(clientIp, reservation.rateLimitDate)
    return errorResult(500, 'queue_unavailable', 'Unable to queue the conversion right now.', { fileId })
  }

  return {
    status: 200,
    body: await buildConversionStatusPayload({
      ...conversion,
      ipAddress: clientIp,
      rateLimitDate: reservation.rateLimitDate,
      status: 'queued',
    }),
  }
}

export async function handleConvertHttpRequest(
  request: Request,
  peerIp?: string,
): Promise<Response> {
  const { resolveClientIpFromRequest } = await getConvertRequestContext()

  const result = await processConvert(
    await request.json(),
    resolveClientIpFromRequest(request, peerIp),
  )
  return Response.json(result.body, { status: result.status })
}

export const convertFile = createServerFn({ method: 'POST' }).handler(async ({ data }) => {
  const { setResponseStatus, resolveClientIp } = await getConvertRequestContext()

  const result = await processConvert(data, resolveClientIp())
  setResponseStatus(result.status)
  return result.body
})
