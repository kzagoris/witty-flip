export type ConversionJobStatus =
  | 'uploaded'
  | 'payment_required'
  | 'pending_payment'
  | 'queued'
  | 'converting'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'expired'

export interface ApiErrorResponse {
  error: string
  message: string
  fileId?: string
  status?: ConversionJobStatus
  checkoutUrl?: string
  remaining?: number
  limit?: number
  resetAt?: string
}

export interface UploadResponse {
  fileId: string
  status: 'uploaded'
}

export interface ConversionStatusResponse {
  fileId: string
  status: ConversionJobStatus
  progress: number
  downloadUrl?: string
  expiresAt?: string
  errorCode?: string
  message?: string
}

export interface RateLimitStatusResponse {
  remaining: number
  limit: number
  resetAt: string
}

export interface CheckoutResponse {
  fileId: string
  sessionId: string
  checkoutUrl: string
}

export interface ApiResult<T> {
  status: number
  body: T
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value)
}

export function statusToProgress(status: ConversionJobStatus): number {
  switch (status) {
    case 'uploaded':
    case 'payment_required':
      return 0
    case 'pending_payment':
      return 10
    case 'queued':
      return 25
    case 'converting':
      return 75
    case 'completed':
    case 'failed':
    case 'timeout':
    case 'expired':
      return 100
  }
}

export function normalizeConversionStatus(value: string | null | undefined): ConversionJobStatus {
  switch (value) {
    case 'uploaded':
    case 'payment_required':
    case 'pending_payment':
    case 'queued':
    case 'converting':
    case 'completed':
    case 'failed':
    case 'timeout':
    case 'expired':
      return value
    default:
      return 'uploaded'
  }
}

export function errorResult(
  status: number,
  error: string,
  message: string,
  extras: Omit<ApiErrorResponse, 'error' | 'message'> = {},
): ApiResult<ApiErrorResponse> {
  return {
    status,
    body: {
      error,
      message,
      ...extras,
    },
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
