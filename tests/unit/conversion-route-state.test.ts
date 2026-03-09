import { describe, expect, it } from "vitest"
import { deriveConversionRouteState } from "~/lib/conversion-route-state"

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
