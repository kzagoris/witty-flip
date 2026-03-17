interface ConversionRouteSearch {
    fileId?: string
    attemptId?: string
    session_id?: string
    canceled?: boolean
}

export interface DerivedConversionRouteState {
    initialFileId?: string
    initialState?: "converting" | "payment_required"
    initialCanceled: boolean
}

export function deriveConversionRouteState(search: ConversionRouteSearch): DerivedConversionRouteState {
    const initialCanceled = Boolean(search.canceled && search.fileId)
    const isCheckoutReturn = Boolean(search.session_id && search.fileId)

    return {
        initialFileId: search.fileId,
        initialState: initialCanceled ? "payment_required" : isCheckoutReturn ? "converting" : undefined,
        initialCanceled,
    }
}

export function shouldSyncConversionSearch(search: ConversionRouteSearch, fileId: string | null): boolean {
    const nextFileId = fileId ?? undefined

    return (
        search.fileId !== nextFileId
        || search.attemptId !== undefined
        || search.session_id !== undefined
        || search.canceled !== undefined
    )
}

export interface DerivedClientConversionRouteState {
    initialAttemptId?: string
    initialState?: "payment_required" | "pending_payment"
    initialCanceled: boolean
}

export function deriveClientConversionRouteState(search: ConversionRouteSearch): DerivedClientConversionRouteState {
    const initialCanceled = Boolean(search.canceled && search.attemptId)
    const isCheckoutReturn = Boolean(search.session_id && search.attemptId)

    return {
        initialAttemptId: search.attemptId,
        initialState: initialCanceled ? "payment_required" : isCheckoutReturn ? "pending_payment" : undefined,
        initialCanceled,
    }
}

export function shouldSyncClientConversionSearch(search: ConversionRouteSearch, attemptId: string | null): boolean {
    const nextAttemptId = attemptId ?? undefined

    return search.attemptId !== nextAttemptId || search.session_id !== undefined || search.canceled !== undefined
}
