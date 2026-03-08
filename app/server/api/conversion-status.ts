import { eq } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { setResponseStatus } from '@tanstack/react-start/server'
import { db } from '~/lib/db'
import { conversions } from '~/lib/db/schema'
import { checkAndConsumeRequestRateLimit } from '~/lib/request-rate-limit'
import { resolveClientIp, resolveClientIpFromRequest } from '~/lib/request-ip'
import { initializeServerRuntime } from '~/lib/server-runtime'
import {
  errorResult,
  isRecord,
  type ApiErrorResponse,
  type ApiResult,
  type ConversionStatusResponse,
} from './contracts'
import { buildConversionStatusPayload } from './status-utils'

function parseFileIdInput(data: unknown): string | undefined {
  if (!isRecord(data) || typeof data['fileId'] !== 'string') {
    return undefined
  }

  const fileId = data['fileId'].trim()
  return fileId.length > 0 ? fileId : undefined
}

export async function processConversionStatus(
  data: unknown,
  clientIp: string,
): Promise<ApiResult<ConversionStatusResponse | ApiErrorResponse>> {
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
  const result = await processConversionStatus(
    { fileId },
    resolveClientIpFromRequest(request, peerIp),
  )
  return Response.json(result.body, { status: result.status })
}

export const getConversionStatus = createServerFn({ method: 'GET' }).handler(async ({ data }) => {
  const result = await processConversionStatus(data, resolveClientIp())
  setResponseStatus(result.status)
  return result.body
})
