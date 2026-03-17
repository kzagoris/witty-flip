import { describe, expect, it } from "vitest"
import {
    deriveClientConversionRouteState,
    deriveConversionRouteState,
    shouldSyncClientConversionSearch,
    shouldSyncConversionSearch,
} from "~/lib/conversion-route-state"

describe("deriveConversionRouteState", () => {
    it("restores the fileId on a plain refresh without checkout params", () => {
        expect(
            deriveConversionRouteState({
                fileId: "02207e2c-549a-4050-93a7-dafe7e13377c",
            }),
        ).toEqual({
            initialFileId: "02207e2c-549a-4050-93a7-dafe7e13377c",
            initialState: undefined,
            initialCanceled: false,
        })
    })

    it("keeps checkout returns in converting state", () => {
        expect(
            deriveConversionRouteState({
                fileId: "02207e2c-549a-4050-93a7-dafe7e13377c",
                session_id: "cs_test_123",
            }),
        ).toEqual({
            initialFileId: "02207e2c-549a-4050-93a7-dafe7e13377c",
            initialState: "converting",
            initialCanceled: false,
        })
    })

    it("restores canceled checkout returns to payment required", () => {
        expect(
            deriveConversionRouteState({
                fileId: "02207e2c-549a-4050-93a7-dafe7e13377c",
                canceled: true,
            }),
        ).toEqual({
            initialFileId: "02207e2c-549a-4050-93a7-dafe7e13377c",
            initialState: "payment_required",
            initialCanceled: true,
        })
    })

    it("stays idle when there is no fileId to restore", () => {
        expect(
            deriveConversionRouteState({
                session_id: "cs_test_123",
                canceled: true,
            }),
        ).toEqual({
            initialFileId: undefined,
            initialState: undefined,
            initialCanceled: false,
        })
    })
})

describe("deriveClientConversionRouteState", () => {
    it("restores the attemptId on a plain refresh without checkout params", () => {
        expect(
            deriveClientConversionRouteState({
                attemptId: "02207e2c-549a-4050-93a7-dafe7e13377c",
            }),
        ).toEqual({
            initialAttemptId: "02207e2c-549a-4050-93a7-dafe7e13377c",
            initialState: undefined,
            initialCanceled: false,
        })
    })

    it("keeps checkout returns in pending payment state", () => {
        expect(
            deriveClientConversionRouteState({
                attemptId: "02207e2c-549a-4050-93a7-dafe7e13377c",
                session_id: "cs_test_123",
            }),
        ).toEqual({
            initialAttemptId: "02207e2c-549a-4050-93a7-dafe7e13377c",
            initialState: "pending_payment",
            initialCanceled: false,
        })
    })

    it("restores canceled client checkout returns to payment required", () => {
        expect(
            deriveClientConversionRouteState({
                attemptId: "02207e2c-549a-4050-93a7-dafe7e13377c",
                canceled: true,
            }),
        ).toEqual({
            initialAttemptId: "02207e2c-549a-4050-93a7-dafe7e13377c",
            initialState: "payment_required",
            initialCanceled: true,
        })
    })

    it("stays idle when there is no attemptId to restore", () => {
        expect(
            deriveClientConversionRouteState({
                session_id: "cs_test_123",
                canceled: true,
            }),
        ).toEqual({
            initialAttemptId: undefined,
            initialState: undefined,
            initialCanceled: false,
        })
    })
})

describe("shouldSyncClientConversionSearch", () => {
    it("returns false when the route search is already in sync", () => {
        expect(
            shouldSyncClientConversionSearch(
                { attemptId: "02207e2c-549a-4050-93a7-dafe7e13377c" },
                "02207e2c-549a-4050-93a7-dafe7e13377c",
            ),
        ).toBe(false)
    })

    it("returns true when the attempt changes or checkout params need clearing", () => {
        expect(
            shouldSyncClientConversionSearch(
                {
                    attemptId: "old-attempt",
                    session_id: "cs_test_123",
                    canceled: true,
                },
                "new-attempt",
            ),
        ).toBe(true)
    })
})

describe("shouldSyncConversionSearch", () => {
    it("returns true when stale client params need clearing", () => {
        expect(
            shouldSyncConversionSearch(
                {
                    fileId: "02207e2c-549a-4050-93a7-dafe7e13377c",
                    attemptId: "old-attempt",
                },
                "02207e2c-549a-4050-93a7-dafe7e13377c",
            ),
        ).toBe(true)
    })
})
