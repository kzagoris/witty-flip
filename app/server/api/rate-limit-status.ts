import { createServerFn } from '@tanstack/react-start'
import { setResponseStatus } from '@tanstack/react-start/server'
import { checkRateLimit } from '~/lib/rate-limit'
import { checkAndConsumeRequestRateLimit } from '~/lib/request-rate-limit'
import { resolveClientIp, resolveClientIpFromRequest } from '~/lib/request-ip'
import { initializeServerRuntime } from '~/lib/server-runtime'
import { errorResult, type ApiErrorResponse, type ApiResult, type RateLimitStatusResponse } from './contracts'

export async function processRateLimitStatus(
  clientIp: string,
): Promise<ApiResult<RateLimitStatusResponse | ApiErrorResponse>> {
  initializeServerRuntime()

  const requestLimit = checkAndConsumeRequestRateLimit(clientIp)
  if (!requestLimit.allowed) {
    return errorResult(429, 'request_rate_limited', 'Too many requests. Please wait a minute and try again.', {
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

export async function handleRateLimitStatusHttpRequest(
  request: Request,
  peerIp?: string,
): Promise<Response> {
  const result = await processRateLimitStatus(resolveClientIpFromRequest(request, peerIp))
  return Response.json(result.body, { status: result.status })
}

export const getRateLimitStatus = createServerFn({ method: 'GET' }).handler(async () => {
  const result = await processRateLimitStatus(resolveClientIp())
  setResponseStatus(result.status)
  return result.body
})
