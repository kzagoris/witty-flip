export const REQUESTS_PER_MINUTE_LIMIT = 10
export const STATUS_REQUESTS_PER_MINUTE_LIMIT = 20
const WINDOW_MS = 60_000

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

function trimWindow(timestamps: number[], now: number): number[] {
  return timestamps.filter(timestamp => now - timestamp < WINDOW_MS)
}

export function checkAndConsumeRequestRateLimit(
  ip: string,
  now = Date.now(),
  options: RequestRateLimitOptions = {},
): RequestRateLimitResult {
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
