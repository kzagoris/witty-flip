import { describe, expect, it } from "vitest"
import { checkAndConsumeRequestRateLimit, STATUS_REQUESTS_PER_MINUTE_LIMIT } from "~/lib/request-rate-limit"
import { DEFAULT_STATUS_POLL_INTERVAL_MS, MIN_STATUS_POLL_INTERVAL_MS } from "~/lib/status-polling"

describe("request-rate-limit", () => {
    it("keeps the default status polling cadence below the status request cap", () => {
        const ip = "203.0.113.40"

        for (let now = 0; now < 60_000; now += DEFAULT_STATUS_POLL_INTERVAL_MS) {
            const result = checkAndConsumeRequestRateLimit(ip, now, {
                bucketKey: "status",
                limit: STATUS_REQUESTS_PER_MINUTE_LIMIT,
            })

            expect(result.allowed).toBe(true)
        }
    })

    it("never polls status more often than every four seconds by default", () => {
        expect(DEFAULT_STATUS_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(MIN_STATUS_POLL_INTERVAL_MS)
    })
})
