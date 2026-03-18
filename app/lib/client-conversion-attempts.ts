import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

export const CLIENT_CONVERSION_ATTEMPT_EXPIRY_MS = 30 * 60_000
export const CLIENT_CONVERSION_RECOVERY_COOKIE_PREFIX = 'wf_attempt_'

export type ClientAttemptStatus =
  | 'reserved'
  | 'payment_required'
  | 'pending_payment'
  | 'ready'
  | 'completed'
  | 'failed'
  | 'expired'

export function normalizeClientAttemptStatus(value: string | null | undefined): ClientAttemptStatus {
  switch (value) {
    case 'reserved':
    case 'payment_required':
    case 'pending_payment':
    case 'ready':
    case 'completed':
    case 'failed':
    case 'expired':
      return value
    default:
      return 'reserved'
  }
}

export function createClientAttemptId(): string {
  return randomUUID()
}

export function createClientAttemptToken(): string {
  return randomUUID()
}

export function hashClientAttemptToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function getClientAttemptRecoveryCookieName(attemptId: string): string {
  return `${CLIENT_CONVERSION_RECOVERY_COOKIE_PREFIX}${attemptId}`
}

export function getClientAttemptExpiresAt(now = Date.now()): string {
  return new Date(now + CLIENT_CONVERSION_ATTEMPT_EXPIRY_MS).toISOString()
}

export function isClientAttemptExpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false

  const parsed = Date.parse(expiresAt)
  if (Number.isNaN(parsed)) return false

  return parsed <= now
}

function getRecoveryCookieSecret(): string {
  const secret = process.env.RECOVERY_COOKIE_SECRET

  if (secret) {
    return secret
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('RECOVERY_COOKIE_SECRET is required in production. Set a dedicated secret — do not reuse STRIPE_SECRET_KEY.')
  }

  return 'development-recovery-cookie-secret'
}

export function signClientAttemptRecoveryCookie(
  attemptId: string,
  secret = getRecoveryCookieSecret(),
): string {
  return createHmac('sha256', secret).update(attemptId).digest('hex')
}

export function hasValidClientAttemptRecoveryCookie(
  attemptId: string,
  cookieValue: string | undefined,
  secret = getRecoveryCookieSecret(),
): boolean {
  if (!cookieValue) {
    return false
  }

  const expected = signClientAttemptRecoveryCookie(attemptId, secret)
  const receivedBuffer = Buffer.from(cookieValue)
  const expectedBuffer = Buffer.from(expected)

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer)
}
