import { eq } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { setResponseStatus } from '@tanstack/react-start/server'
import { db } from '~/lib/db'
import { conversions } from '~/lib/db/schema'
import { checkAndConsumeRequestRateLimit } from '~/lib/request-rate-limit'
import { resolveClientIp, resolveClientIpFromRequest } from '~/lib/request-ip'
import { initializeServerRuntime } from '~/lib/server-runtime'
import { createCheckoutSession } from '~/lib/stripe'
import {
  errorResult,
  isRecord,
  normalizeConversionStatus,
  type ApiErrorResponse,
  type ApiResult,
  type CheckoutResponse,
} from './contracts'

function parseFileIdInput(data: unknown): string | undefined {
  if (!isRecord(data) || typeof data['fileId'] !== 'string') {
    return undefined
  }

  const fileId = data['fileId'].trim()
  return fileId.length > 0 ? fileId : undefined
}

function mapCheckoutError(fileId: string, error: unknown): ApiResult<ApiErrorResponse> {
  const message = error instanceof Error ? error.message : 'Unknown checkout error.'

  if (message.startsWith('Cannot create checkout for conversion with status')) {
    return errorResult(409, 'invalid_status', message, { fileId })
  }

  if (message === 'Conversion not found.') {
    return errorResult(404, 'not_found', message, { fileId })
  }

  return errorResult(500, 'checkout_unavailable', 'Unable to start checkout right now. Please try again.', {
    fileId,
  })
}

export async function processCreateCheckout(
  data: unknown,
  clientIp: string,
): Promise<ApiResult<CheckoutResponse | ApiErrorResponse>> {
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

  if (conversionStatus !== 'payment_required' && conversionStatus !== 'pending_payment') {
    return errorResult(
      409,
      'invalid_status',
      `Cannot create a checkout session for status "${conversionStatus}".`,
      {
        fileId,
        status: conversionStatus,
      },
    )
  }

  await db
    .update(conversions)
    .set({ ipAddress: clientIp })
    .where(eq(conversions.id, fileId))

  try {
    const checkout = await createCheckoutSession(fileId)
    return {
      status: 200,
      body: {
        fileId,
        checkoutUrl: checkout.checkoutUrl,
        sessionId: checkout.sessionId,
      },
    }
  } catch (error) {
    return mapCheckoutError(fileId, error)
  }
}

export async function handleCreateCheckoutHttpRequest(
  request: Request,
  peerIp?: string,
): Promise<Response> {
  const result = await processCreateCheckout(
    await request.json(),
    resolveClientIpFromRequest(request, peerIp),
  )
  return Response.json(result.body, { status: result.status })
}

export const createCheckout = createServerFn({ method: 'POST' }).handler(async ({ data }) => {
  const result = await processCreateCheckout(data, resolveClientIp())
  setResponseStatus(result.status)
  return result.body
})
