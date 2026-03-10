export const REQUEST_ID_HEADER = 'x-request-id'

function sanitizeRequestId(value: string): string {
  const trimmed = value.trim()
  return trimmed.length > 128 ? trimmed.slice(0, 128) : trimmed
}

export function resolveRequestId(request?: Request): string {
  const headerValue = request?.headers.get(REQUEST_ID_HEADER)
  if (headerValue) {
    const requestId = sanitizeRequestId(headerValue)
    if (requestId) return requestId
  }

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function withRequestIdHeader(requestId: string, headers?: HeadersInit): Headers {
  const responseHeaders = new Headers(headers)
  responseHeaders.set(REQUEST_ID_HEADER, requestId)
  return responseHeaders
}
