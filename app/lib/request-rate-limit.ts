export const REQUESTS_PER_MINUTE_LIMIT = 10
export const STATUS_REQUESTS_PER_MINUTE_LIMIT = 20
export const CLIENT_CONVERSION_REQUESTS_PER_MINUTE_LIMIT = 10
export const CLIENT_CONVERSION_STATUS_REQUESTS_PER_MINUTE_LIMIT = 20
const WINDOW_MS = 60_000
const SWEEP_SIZE_THRESHOLD = 1_000

export interface RequestRateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: string
}

interface RequestRateLimitOptions {
  limit?: number
  bucketKey?: string
}

const requestBuckets = new Map<string, number[]>()
let nextSweepAt = 0

function trimWindow(timestamps: number[], now: number): number[] {
  return timestamps.filter(timestamp => now - timestamp < WINDOW_MS)
}

function sweepExpiredBuckets(now: number): void {
  if (now < nextSweepAt && requestBuckets.size < SWEEP_SIZE_THRESHOLD) return

  nextSweepAt = now + WINDOW_MS

  for (const [bucketId, timestamps] of requestBuckets) {
    const trimmed = trimWindow(timestamps, now)
    if (trimmed.length === 0) {
      requestBuckets.delete(bucketId)
      continue
    }

    if (trimmed.length !== timestamps.length) {
      requestBuckets.set(bucketId, trimmed)
    }
  }
}

export function getRequestRateLimitBucketCount(): number {
  return requestBuckets.size
}

export function _resetRequestRateLimitBuckets(): void {
  requestBuckets.clear()
  nextSweepAt = 0
}

export function checkAndConsumeRequestRateLimit(
  ip: string,
  now = Date.now(),
  options: RequestRateLimitOptions = {},
): RequestRateLimitResult {
  sweepExpiredBuckets(now)

  const limit = options.limit ?? REQUESTS_PER_MINUTE_LIMIT
  const bucketId = `${options.bucketKey ?? 'default'}:${ip}`
  const bucket = trimWindow(requestBuckets.get(bucketId) ?? [], now)

  if (bucket.length >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: new Date(bucket[0] + WINDOW_MS).toISOString(),
    }
  }

  bucket.push(now)
  requestBuckets.set(bucketId, bucket)

  return {
    allowed: true,
    limit,
    remaining: limit - bucket.length,
    resetAt: new Date(bucket[0] + WINDOW_MS).toISOString(),
  }
}
