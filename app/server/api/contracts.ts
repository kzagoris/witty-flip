import type { ClientAttemptStatus } from '~/lib/client-conversion-attempts'

export type { ClientAttemptStatus }

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

export type ClientConversionInputMode = 'file' | 'paste'

export interface ApiErrorResponse {
  error: string
  message: string
  fileId?: string
  attemptId?: string
  status?: ConversionJobStatus | ClientAttemptStatus
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
  sessionId: string
  checkoutUrl: string
}

export type ServerCheckoutResponse = CheckoutResponse & { fileId: string }

export type ClientCheckoutResponse = CheckoutResponse & { attemptId: string }

export type CheckoutRequest = { fileId: string } | { attemptId: string }

export interface ClientConversionStartRequest {
  conversionSlug: string
  originalFilename?: string
  fileSizeBytes?: number
  inputMode: ClientConversionInputMode
}

export type ClientConversionStartResponse =
  | {
      allowed: true
      attemptId: string
      token: string
      processingMode: 'client'
      status: 'reserved'
      remainingFreeAfterReservation: number
    }
  | {
      allowed: false
      attemptId: string
      requiresPayment: true
      processingMode: 'client'
      status: 'payment_required'
    }

export interface ClientConversionStatusRequest {
  attemptId: string
}

export interface ClientConversionStatusResponse {
  attemptId: string
  status: ClientAttemptStatus
  processingMode: 'client'
  paid: boolean
  expiresAt: string
  token?: string
  errorCode?: string
  message?: string
}

export interface ClientConversionCompleteRequest {
  attemptId: string
  token: string
  outputFilename: string
  outputMimeType: string
  outputSizeBytes?: number
  durationMs?: number
}

export interface ClientConversionCompleteResponse {
  recorded: true
}

export interface ClientConversionFailRequest {
  attemptId: string
  token: string
  errorCode: string
  errorMessage?: string
}

export interface ClientConversionFailResponse {
  released: true
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

export function parseOptionalNonNegativeInteger(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return undefined
  }

  return value
}
