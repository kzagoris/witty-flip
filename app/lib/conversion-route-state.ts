interface ConversionRouteSearch {
    fileId?: string
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

    return search.fileId !== nextFileId || search.session_id !== undefined || search.canceled !== undefined
}
