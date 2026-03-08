export const REQUESTS_PER_MINUTE_LIMIT = 10
const WINDOW_MS = 60_000

export interface RequestRateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: string
}

const requestBuckets = new Map<string, number[]>()

function trimWindow(timestamps: number[], now: number): number[] {
  return timestamps.filter(timestamp => now - timestamp < WINDOW_MS)
}

export function checkAndConsumeRequestRateLimit(
  ip: string,
  now = Date.now(),
): RequestRateLimitResult {
  const bucket = trimWindow(requestBuckets.get(ip) ?? [], now)

  if (bucket.length >= REQUESTS_PER_MINUTE_LIMIT) {
    return {
      allowed: false,
      limit: REQUESTS_PER_MINUTE_LIMIT,
      remaining: 0,
      resetAt: new Date(bucket[0] + WINDOW_MS).toISOString(),
    }
  }

  bucket.push(now)
  requestBuckets.set(ip, bucket)

  return {
    allowed: true,
    limit: REQUESTS_PER_MINUTE_LIMIT,
    remaining: REQUESTS_PER_MINUTE_LIMIT - bucket.length,
    resetAt: new Date(bucket[0] + WINDOW_MS).toISOString(),
  }
}
