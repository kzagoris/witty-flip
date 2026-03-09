import { useState, useCallback, useRef, useEffect } from 'react'
import { uploadFile } from '~/server/api/upload'
import { convertFile } from '~/server/api/convert'
import { getConversionStatus } from '~/server/api/conversion-status'
import { callServerFn } from '~/lib/api-client'
import type { ConversionStatusResponse, ApiErrorResponse, UploadResponse } from '~/server/api/contracts'
import { usePolling } from './usePolling'

export type FlowState =
  | 'idle'
  | 'uploading'
  | 'converting'
  | 'completed'
  | 'payment_required'
  | 'pending_payment'
  | 'failed'
  | 'timeout'
  | 'expired'

const POLL_INTERVAL_MS = 3000
const MAX_POLL_INTERVAL_MS = 10_000
const MAX_CONSECUTIVE_POLL_ERRORS = 10
const ACTIVE_POLL_STATES = new Set<FlowState>(['converting', 'pending_payment'])

interface UseConversionFlowOptions {
  conversionType: string
  initialFileId?: string
  initialState?: Extract<FlowState, 'converting' | 'payment_required'>
  initialCanceled?: boolean
  onFileIdChange?: (fileId: string | null) => void
  onExpired?: () => void
}

function parseResetTime(resetAt?: string): number {
  if (!resetAt) return Date.now() + 60_000

  const parsed = new Date(resetAt).getTime()
  return Number.isNaN(parsed) ? Date.now() + 60_000 : parsed
}

export function useConversionFlow({
  conversionType,
  initialFileId,
  initialState,
  initialCanceled,
  onFileIdChange,
  onExpired,
}: UseConversionFlowOptions) {
  const [state, setState] = useState<FlowState>(initialState ?? (initialFileId ? 'converting' : 'idle'))
  const [fileId, setFileId] = useState<string | null>(initialFileId ?? null)
  const [status, setStatus] = useState<ConversionStatusResponse | null>(null)
  const [error, setError] = useState<ApiErrorResponse | null>(null)
  const [canceledMessage, setCanceledMessage] = useState<string | null>(
    initialCanceled ? 'Checkout was canceled. You can try again or complete payment to continue.' : null,
  )
  const [isVisible, setIsVisible] = useState(
    typeof document === 'undefined' ? true : document.visibilityState === 'visible',
  )
  const [pollIntervalMs, setPollIntervalMs] = useState(POLL_INTERVAL_MS)
  const [pollBlockedUntil, setPollBlockedUntil] = useState<number | null>(null)

  const consecutiveErrorsRef = useRef(0)

  useEffect(() => {
    onFileIdChange?.(fileId)
  }, [fileId, onFileIdChange])

  const markExpired = useCallback(() => {
    setState('expired')
    setStatus((currentStatus) => {
      if (!currentStatus) return currentStatus

      return {
        ...currentStatus,
        status: 'expired',
        message: currentStatus.message ?? 'Download window has expired.',
      }
    })
    onExpired?.()
  }, [onExpired])

  useEffect(() => {
    if (typeof document === 'undefined') return

    const handler = () => {
      setIsVisible(document.visibilityState === 'visible')
    }

    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  useEffect(() => {
    if (pollBlockedUntil == null || typeof window === 'undefined') return

    const timeoutMs = Math.max(pollBlockedUntil - Date.now(), 0)
    const timeoutId = window.setTimeout(() => {
      setPollBlockedUntil(null)
    }, timeoutMs)

    return () => window.clearTimeout(timeoutId)
  }, [pollBlockedUntil])

  const applyStatus = useCallback((nextStatus: ConversionStatusResponse) => {
    consecutiveErrorsRef.current = 0
    setPollIntervalMs(POLL_INTERVAL_MS)
    setPollBlockedUntil(null)
    setStatus(nextStatus)
    setError(null)

    switch (nextStatus.status) {
      case 'completed':
        if (nextStatus.downloadUrl) {
          setState('completed')
        } else {
          setError({
            error: nextStatus.errorCode ?? 'artifact_missing',
            message: nextStatus.message ?? 'The converted file is no longer available.',
          })
          setState('failed')
        }
        break
      case 'payment_required':
        setState('payment_required')
        break
      case 'pending_payment':
        setState('pending_payment')
        break
      case 'failed':
        setError({
          error: nextStatus.errorCode ?? 'conversion_failed',
          message: nextStatus.message ?? 'Conversion failed.',
        })
        setState('failed')
        break
      case 'timeout':
        setError({
          error: 'conversion_timeout',
          message: nextStatus.message ?? 'Conversion timed out.',
        })
        setState('timeout')
        break
      case 'expired':
        markExpired()
        break
      case 'queued':
      case 'converting':
      case 'uploaded':
        setState('converting')
        break
    }
  }, [markExpired])

  const handlePollError = useCallback((nextError: ApiErrorResponse) => {
    if (nextError.error === 'request_rate_limited') {
      consecutiveErrorsRef.current = 0
      setPollIntervalMs(POLL_INTERVAL_MS)
      setPollBlockedUntil(parseResetTime(nextError.resetAt))
      return
    }

    consecutiveErrorsRef.current += 1
    setPollIntervalMs(
      Math.min(POLL_INTERVAL_MS * (2 ** Math.min(consecutiveErrorsRef.current, 3)), MAX_POLL_INTERVAL_MS),
    )

    if (consecutiveErrorsRef.current > MAX_CONSECUTIVE_POLL_ERRORS) {
      setError(nextError)
      setState('failed')
    }
  }, [])

  const shouldPoll = fileId != null && ACTIVE_POLL_STATES.has(state) && isVisible && pollBlockedUntil == null

  const pollStatus = useCallback(async () => {
    if (!fileId) return

    const result = await callServerFn<ConversionStatusResponse>(getConversionStatus, { fileId })
    if (!result.ok) {
      handlePollError(result.error)
      return
    }

    applyStatus(result.data)
  }, [applyStatus, fileId, handlePollError])

  usePolling(() => void pollStatus(), pollIntervalMs, shouldPoll)

  const startUpload = useCallback(
    async (file: File) => {
      setState('uploading')
      setError(null)
      setStatus(null)
      setCanceledMessage(null)
      setPollIntervalMs(POLL_INTERVAL_MS)
      setPollBlockedUntil(null)
      consecutiveErrorsRef.current = 0

      const formData = new FormData()
      formData.append('file', file)
      formData.append('conversionType', conversionType)

      const uploadResult = await callServerFn<UploadResponse>(uploadFile, formData)
      if (!uploadResult.ok) {
        setError(uploadResult.error)
        setState('failed')
        return
      }

      const newFileId = uploadResult.data.fileId
      setFileId(newFileId)

      const convertResult = await callServerFn<ConversionStatusResponse>(convertFile, { fileId: newFileId })
      if (!convertResult.ok) {
        const convertError = convertResult.error
        if (convertError.status === 'payment_required') {
          setStatus({
            fileId: newFileId,
            status: 'payment_required',
            progress: 0,
            message: convertError.message,
          })
          setState('payment_required')
          return
        }

        setError(convertError)
        setState('failed')
        return
      }

      applyStatus(convertResult.data)
    },
    [applyStatus, conversionType],
  )

  const reset = useCallback(() => {
    setState('idle')
    setFileId(null)
    setStatus(null)
    setError(null)
    setCanceledMessage(null)
    setPollIntervalMs(POLL_INTERVAL_MS)
    setPollBlockedUntil(null)
    consecutiveErrorsRef.current = 0
  }, [])

  return {
    state,
    fileId,
    status,
    error,
    canceledMessage,
    startUpload,
    markExpired,
    reset,
  }
}
