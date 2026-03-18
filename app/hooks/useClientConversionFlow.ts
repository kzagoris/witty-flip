import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getClientConverter } from "~/lib/client-converters"
import type { ClientConversionProcessingMode, ClientConversionResult } from "~/lib/client-converters/types"
import { EnhancedCodecLoadError } from "~/lib/client-converters/webp-converter"
import type { ClientConversionType } from "~/lib/conversions"
import { DEFAULT_STATUS_POLL_INTERVAL_MS } from "~/lib/status-polling"
import { callServerFn } from "~/lib/api-client"
import { completeClientConversion } from "~/server/api/client-conversion-complete"
import { failClientConversion } from "~/server/api/client-conversion-fail"
import { startClientConversion } from "~/server/api/client-conversion-start"
import { getClientConversionStatus } from "~/server/api/client-conversion-status"
import type {
    ApiErrorResponse,
    ClientConversionStartResponse,
    ClientConversionStatusResponse,
} from "~/server/api/contracts"
import { usePolling } from "./usePolling"

export type ClientFlowState =
    | "idle"
    | "reserving"
    | "payment_required"
    | "pending_payment"
    | "converting"
    | "completed"
    | "failed"
    | "expired"

interface UseClientConversionFlowOptions {
    conversion: ClientConversionType
    initialAttemptId?: string
    initialState?: Extract<ClientFlowState, "payment_required" | "pending_payment">
    initialCanceled?: boolean
    onAttemptIdChange?: (attemptId: string | null) => void
    onExpired?: () => void
}

const TOKEN_STORAGE_PREFIX = "wf-client-token:"
const DEFAULT_QUALITY = 0.92

function getStoredTokenKey(attemptId: string): string {
    return `${TOKEN_STORAGE_PREFIX}${attemptId}`
}

function readStoredToken(attemptId: string | null): string | null {
    if (!attemptId || typeof window === "undefined") {
        return null
    }

    return window.sessionStorage.getItem(getStoredTokenKey(attemptId))
}

function storeToken(attemptId: string, token: string): void {
    if (typeof window === "undefined") {
        return
    }

    window.sessionStorage.setItem(getStoredTokenKey(attemptId), token)
}

function clearStoredToken(attemptId: string | null): void {
    if (!attemptId || typeof window === "undefined") {
        return
    }

    window.sessionStorage.removeItem(getStoredTokenKey(attemptId))
}

function createClientError(
    error: string,
    message: string,
    extras: Partial<ApiErrorResponse> = {},
): ApiErrorResponse {
    return {
        error,
        message,
        ...extras,
    }
}

function getResultSizeBytes(result: ClientConversionResult): number | undefined {
    if (result.kind === "binary") {
        return result.blob?.size
    }

    if (typeof result.text === "string") {
        return new Blob([result.text], { type: result.mimeType }).size
    }

    return undefined
}

function resolveDurationMs(startTimeMs: number): number {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now()
    return Math.max(0, Math.round(now - startTimeMs))
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError"
}

export function useClientConversionFlow({
    conversion,
    initialAttemptId,
    initialState,
    initialCanceled,
    onAttemptIdChange,
    onExpired,
}: UseClientConversionFlowOptions) {
    const [state, setState] = useState<ClientFlowState>(initialState ?? "idle")
    const [attemptId, setAttemptId] = useState<string | null>(initialAttemptId ?? null)
    const [status, setStatus] = useState<ClientConversionStatusResponse | null>(null)
    const [error, setError] = useState<ApiErrorResponse | null>(null)
    const [result, setResult] = useState<ClientConversionResult | null>(null)
    const [progress, setProgress] = useState(0)
    const [progressMessage, setProgressMessage] = useState("Select a file to begin.")
    const [canceledMessage, setCanceledMessage] = useState<string | null>(
        initialCanceled ? "Checkout was canceled. You can retry payment or start again." : null,
    )
    const [needsFileReselection, setNeedsFileReselection] = useState(false)
    const [reselectionMessage, setReselectionMessage] = useState<string | null>(null)
    const [isVisible, setIsVisible] = useState(
        typeof document === "undefined" ? true : document.visibilityState === "visible",
    )
    const [processingMode, setProcessingMode] = useState<ClientConversionProcessingMode>("standard")
    const [quality, setQuality] = useState(DEFAULT_QUALITY)
    const [enhancedLoadFailed, setEnhancedLoadFailed] = useState(false)
    const [bookkeepingFailed, setBookkeepingFailed] = useState(false)

    const fileRef = useRef<File | null>(null)
    const conversionAbortControllerRef = useRef<AbortController | null>(null)
    const restoreHandledRef = useRef(false)

    const supportsEnhancedMode = useMemo(
        () => Boolean(conversion.clientConverterEnhanced),
        [conversion.clientConverterEnhanced],
    )

    const effectiveProcessingMode = supportsEnhancedMode ? processingMode : "standard"

    useEffect(() => {
        if (!supportsEnhancedMode && processingMode === "enhanced") {
            setProcessingMode("standard")
        }
    }, [processingMode, supportsEnhancedMode])

    useEffect(() => {
        onAttemptIdChange?.(attemptId)
    }, [attemptId, onAttemptIdChange])

    useEffect(() => {
        if (typeof document === "undefined") {
            return
        }

        const handleVisibilityChange = () => {
            setIsVisible(document.visibilityState === "visible")
        }

        document.addEventListener("visibilitychange", handleVisibilityChange)
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
    }, [])

    const expireAttempt = useCallback((currentAttemptId: string | null, message?: string) => {
        clearStoredToken(currentAttemptId)
        conversionAbortControllerRef.current?.abort()
        conversionAbortControllerRef.current = null
        fileRef.current = null
        setAttemptId(null)
        setResult(null)
        setError(null)
        setStatus((currentStatus) => currentStatus
            ? {
                ...currentStatus,
                status: "expired",
                message: message ?? currentStatus.message ?? "This conversion attempt has expired. Please start again.",
            }
            : null)
        setNeedsFileReselection(false)
        setReselectionMessage(null)
        setProgress(0)
        setProgressMessage("This conversion attempt has expired. Please start again.")
        setState("expired")
        onExpired?.()
    }, [onExpired])

    const markExpired = useCallback(() => {
        expireAttempt(attemptId)
    }, [attemptId, expireAttempt])

    const reset = useCallback(() => {
        clearStoredToken(attemptId)
        conversionAbortControllerRef.current?.abort()
        conversionAbortControllerRef.current = null
        fileRef.current = null
        setAttemptId(null)
        setStatus(null)
        setError(null)
        setResult(null)
        setNeedsFileReselection(false)
        setReselectionMessage(null)
        setCanceledMessage(null)
        setBookkeepingFailed(false)
        setProgress(0)
        setProgressMessage("Select a file to begin.")
        setState("idle")
    }, [attemptId])

    const runClientConversion = useCallback(async (
        file: File,
        currentAttemptId: string,
        token: string,
        modeOverride?: ClientConversionProcessingMode,
    ) => {
        conversionAbortControllerRef.current?.abort()
        const abortController = new AbortController()
        conversionAbortControllerRef.current = abortController
        fileRef.current = file

        setState("converting")
        setError(null)
        setResult(null)
        setEnhancedLoadFailed(false)
        setBookkeepingFailed(false)
        setNeedsFileReselection(false)
        setReselectionMessage(null)
        setCanceledMessage(null)
        setProgress(12)
        setProgressMessage("Preparing your in-browser conversion...")

        const startTimeMs = typeof performance !== "undefined" ? performance.now() : Date.now()
        const activeMode = modeOverride ?? effectiveProcessingMode
        const converterName =
            activeMode === "enhanced" && conversion.clientConverterEnhanced
                ? conversion.clientConverterEnhanced
                : conversion.clientConverter

        let nextResult: ClientConversionResult | undefined

        try {
            const converter = await getClientConverter(converterName, {
                targetMimeType: conversion.targetMimeType,
                targetExtension: conversion.targetExtension,
                defaultQuality: quality,
            })

            if (!converter) {
                throw new Error("This browser conversion mode is unavailable right now.")
            }

            const support = await converter.isSupported({
                file,
                filename: file.name,
            })

            if (!support.supported) {
                throw new Error(support.reason ?? "This browser cannot run the requested conversion.")
            }

            nextResult = await converter.convert(
                {
                    file,
                    filename: file.name,
                },
                {
                    signal: abortController.signal,
                    quality,
                    processingMode: activeMode,
                    onProgress: (percent) => {
                        setProgress(Math.min(96, Math.max(20, Math.round(percent))))
                        setProgressMessage("Converting in your browser...")
                    },
                },
            )

            setProgress(98)
            setProgressMessage("Finalizing conversion...")

            let bookkeepingOk = false
            try {
                const completionPayload = {
                    attemptId: currentAttemptId,
                    token,
                    outputFilename: nextResult.filename,
                    outputMimeType: nextResult.mimeType,
                    outputSizeBytes: getResultSizeBytes(nextResult),
                    durationMs: resolveDurationMs(startTimeMs),
                }

                const completionResult = await callServerFn(completeClientConversion, completionPayload)

                if (!completionResult.ok) {
                    if (completionResult.error.status === "expired") {
                        expireAttempt(currentAttemptId, completionResult.error.message)
                        return
                    }

                    // Retry once
                    const retryResult = await callServerFn(completeClientConversion, completionPayload)
                    if (!retryResult.ok) {
                        if (retryResult.error.status === "expired") {
                            expireAttempt(currentAttemptId, retryResult.error.message)
                            return
                        }
                    } else {
                        bookkeepingOk = true
                    }
                } else {
                    bookkeepingOk = true
                }
            } catch {
                // Network/fetch failure — bookkeeping lost, conversion result still valid
            }

            if (bookkeepingOk) {
                clearStoredToken(currentAttemptId)
                fileRef.current = null
                setAttemptId(null)
            } else {
                setBookkeepingFailed(true)
            }
            setStatus(null)
            setError(null)
            setResult(nextResult)
            setProgress(100)
            setProgressMessage(
                bookkeepingOk
                    ? "Conversion complete. Ready to download."
                    : "Conversion complete. Server recording could not be confirmed.",
            )
            setState("completed")
        } catch (nextError) {
            if (nextError instanceof EnhancedCodecLoadError) {
                setProgress(0)
                setProgressMessage(nextError.message)
                setEnhancedLoadFailed(true)
                setState("idle")
                return
            }

            if (nextResult) {
                // Conversion succeeded but something threw after — still show result
                setBookkeepingFailed(true)
                setStatus(null)
                setError(null)
                setResult(nextResult)
                setProgress(100)
                setProgressMessage("Conversion complete. Server recording could not be confirmed.")
                setState("completed")
                return
            }

            const clientError = createClientError(
                isAbortError(nextError) ? "conversion_canceled" : "client_conversion_failed",
                nextError instanceof Error ? nextError.message : "Client conversion failed.",
                { attemptId: currentAttemptId },
            )

            clearStoredToken(currentAttemptId)

            const failureResult = await callServerFn(failClientConversion, {
                attemptId: currentAttemptId,
                token,
                errorCode: clientError.error,
                errorMessage: clientError.message,
            })

            if (!failureResult.ok && failureResult.error.status === "expired") {
                expireAttempt(currentAttemptId, failureResult.error.message)
                return
            }

            fileRef.current = null
            setError(clientError)
            setProgress(0)
            setProgressMessage(clientError.message)
            setState("failed")
        } finally {
            conversionAbortControllerRef.current = null
        }
    }, [
        conversion.clientConverter,
        conversion.clientConverterEnhanced,
        conversion.targetExtension,
        conversion.targetMimeType,
        effectiveProcessingMode,
        expireAttempt,
        quality,
    ])

    const handleStatusResponse = useCallback(async (nextStatus: ClientConversionStatusResponse) => {
        setStatus(nextStatus)
        setError(null)

        const storedToken = readStoredToken(nextStatus.attemptId)
        const availableToken = nextStatus.token ?? storedToken

        if (nextStatus.token) {
            storeToken(nextStatus.attemptId, nextStatus.token)
        }

        switch (nextStatus.status) {
            case "payment_required":
                setState("payment_required")
                setProgress(0)
                setProgressMessage(nextStatus.message ?? "Payment is required to continue.")
                return

            case "pending_payment":
                setState("pending_payment")
                setProgress(15)
                setProgressMessage(nextStatus.message ?? "Waiting for payment confirmation...")
                return

            case "expired":
                expireAttempt(nextStatus.attemptId, nextStatus.message)
                return

            case "failed":
                clearStoredToken(nextStatus.attemptId)
                setState("failed")
                setProgress(0)
                setProgressMessage(nextStatus.message ?? "Client conversion failed.")
                setError(
                    createClientError(
                        nextStatus.errorCode ?? "client_conversion_failed",
                        nextStatus.message ?? "Client conversion failed.",
                        {
                            attemptId: nextStatus.attemptId,
                            status: nextStatus.status,
                        },
                    ),
                )
                return

            case "completed":
                clearStoredToken(nextStatus.attemptId)
                setAttemptId(null)
                setState("failed")
                setProgress(0)
                setProgressMessage("This in-browser result cannot be restored after a refresh.")
                setError(
                    createClientError(
                        "restart_required",
                        "This in-browser conversion already finished in another session. Please start again.",
                        { attemptId: nextStatus.attemptId, status: nextStatus.status },
                    ),
                )
                return

            case "ready": {
                if (!availableToken) {
                    setState("failed")
                    setProgress(0)
                    setProgressMessage("Recovery token unavailable. Please start again.")
                    setError(
                        createClientError(
                            "restart_required",
                            "Payment was confirmed, but the recovery token is no longer available. Please start again.",
                            { attemptId: nextStatus.attemptId, status: nextStatus.status },
                        ),
                    )
                    return
                }

                if (fileRef.current) {
                    await runClientConversion(fileRef.current, nextStatus.attemptId, availableToken)
                    return
                }

                setState("idle")
                setNeedsFileReselection(true)
                setReselectionMessage("Payment confirmed! Please reselect your file to complete the conversion.")
                setProgress(0)
                setProgressMessage("Payment confirmed. Reselect your file to continue.")
                return
            }

            case "reserved": {
                if (!availableToken) {
                    setState("failed")
                    setProgress(0)
                    setProgressMessage("Recovery token unavailable. Please start again.")
                    setError(
                        createClientError(
                            "restart_required",
                            "This conversion needs the original browser session token. Please start again.",
                            { attemptId: nextStatus.attemptId, status: nextStatus.status },
                        ),
                    )
                    return
                }

                if (fileRef.current) {
                    await runClientConversion(fileRef.current, nextStatus.attemptId, availableToken)
                    return
                }

                setState("idle")
                setNeedsFileReselection(true)
                setReselectionMessage("Please reselect your file to finish the in-browser conversion.")
                setProgress(0)
                setProgressMessage("Reselect your file to continue.")
                return
            }
        }
    }, [expireAttempt, runClientConversion])

    const fetchAttemptStatus = useCallback(async (currentAttemptId = attemptId) => {
        if (!currentAttemptId) {
            return
        }

        const statusResult = await callServerFn(getClientConversionStatus, { attemptId: currentAttemptId })
        if (!statusResult.ok) {
            if (statusResult.error.status === "expired") {
                expireAttempt(currentAttemptId, statusResult.error.message)
                return
            }

            setState("failed")
            setProgress(0)
            setProgressMessage(statusResult.error.message)
            setError(statusResult.error)
            return
        }

        await handleStatusResponse(statusResult.data)
    }, [attemptId, expireAttempt, handleStatusResponse])

    useEffect(() => {
        if (restoreHandledRef.current) {
            return
        }

        restoreHandledRef.current = true

        if (!initialAttemptId) {
            return
        }

        if (initialState === "payment_required") {
            setState("payment_required")
            setProgress(0)
            setProgressMessage("Payment is required to continue.")
            return
        }

        if (initialState === "pending_payment") {
            setState("pending_payment")
            setProgress(15)
            setProgressMessage("Waiting for payment confirmation...")
        }

        void fetchAttemptStatus(initialAttemptId)
    }, [fetchAttemptStatus, initialAttemptId, initialState])

    const shouldPoll = attemptId != null && state === "pending_payment" && isVisible
    usePolling(() => void fetchAttemptStatus(), DEFAULT_STATUS_POLL_INTERVAL_MS, shouldPoll)

    const startConversion = useCallback(async (file: File) => {
        if (state === "reserving" || state === "converting" || state === "pending_payment") {
            return
        }

        fileRef.current = file
        setResult(null)
        setError(null)
        setStatus(null)
        setCanceledMessage(null)
        setNeedsFileReselection(false)
        setReselectionMessage(null)

        const existingToken = readStoredToken(attemptId)
        if (attemptId && existingToken) {
            await runClientConversion(file, attemptId, existingToken)
            return
        }

        setState("reserving")
        setProgress(10)
        setProgressMessage("Reserving your client conversion...")

        const startResult = await callServerFn<ClientConversionStartResponse>(startClientConversion, {
            conversionSlug: conversion.slug,
            originalFilename: file.name,
            fileSizeBytes: file.size,
            inputMode: "file",
        })

        if (!startResult.ok) {
            setError(startResult.error)
            setState("failed")
            setProgress(0)
            setProgressMessage(startResult.error.message)
            return
        }

        const nextAttemptId = startResult.data.attemptId
        setAttemptId(nextAttemptId)

        if (!startResult.data.allowed) {
            setState("payment_required")
            setProgress(0)
            setProgressMessage("Payment is required to continue.")
            return
        }

        storeToken(nextAttemptId, startResult.data.token)
        await runClientConversion(file, nextAttemptId, startResult.data.token)
    }, [attemptId, conversion.slug, runClientConversion, state])

    const retryEnhanced = useCallback(() => {
        setEnhancedLoadFailed(false)
        const file = fileRef.current
        const token = readStoredToken(attemptId)
        if (file && attemptId && token) {
            void runClientConversion(file, attemptId, token)
        }
    }, [attemptId, runClientConversion])

    const switchToStandard = useCallback(() => {
        setEnhancedLoadFailed(false)
        setProcessingMode("standard")
        const file = fileRef.current
        const token = readStoredToken(attemptId)
        if (file && attemptId && token) {
            void runClientConversion(file, attemptId, token, "standard")
        }
    }, [attemptId, runClientConversion])

    const downloadResult = useCallback(() => {
        if (!result || typeof window === "undefined" || typeof document === "undefined") {
            return
        }

        const blob =
            result.kind === "binary"
                ? result.blob
                : typeof result.text === "string"
                    ? new Blob([result.text], { type: result.mimeType })
                    : undefined

        if (!blob) {
            return
        }

        const objectUrl = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = objectUrl
        link.download = result.filename
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    }, [result])

    return {
        state,
        attemptId,
        status,
        error,
        result,
        progress,
        progressMessage,
        canceledMessage,
        needsFileReselection,
        reselectionMessage,
        processingMode: effectiveProcessingMode,
        quality,
        enhancedLoadFailed,
        bookkeepingFailed,
        supportsEnhancedMode,
        setProcessingMode,
        setQuality,
        startConversion,
        retryEnhanced,
        switchToStandard,
        downloadResult,
        markExpired,
        reset,
    }
}
