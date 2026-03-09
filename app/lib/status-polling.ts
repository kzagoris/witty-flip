import { STATUS_REQUESTS_PER_MINUTE_LIMIT } from "./request-rate-limit"

export const MIN_STATUS_POLL_INTERVAL_MS = 4_000
export const STATUS_POLL_HEADROOM_REQUESTS = 5

export function getStatusPollIntervalMs(limit = STATUS_REQUESTS_PER_MINUTE_LIMIT): number {
    const safeRequestsPerMinute = Math.max(limit - STATUS_POLL_HEADROOM_REQUESTS, 1)
    return Math.max(MIN_STATUS_POLL_INTERVAL_MS, Math.ceil(60_000 / safeRequestsPerMinute))
}

export const DEFAULT_STATUS_POLL_INTERVAL_MS = getStatusPollIntervalMs()
