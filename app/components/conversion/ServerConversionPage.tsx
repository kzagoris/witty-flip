import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { PageShell } from '~/components/layout/PageShell'
import { ConversionHero } from '~/components/conversion/ConversionHero'
import { SEOContent } from '~/components/conversion/SEOContent'
import { FAQSection } from '~/components/conversion/FAQSection'
import { RelatedConversions } from '~/components/conversion/RelatedConversions'
import { FileUploader } from '~/components/conversion/FileUploader'
import { ConversionStatus } from '~/components/conversion/ConversionStatus'
import { ConversionProgress } from '~/components/conversion/ConversionProgress'
import { ErrorCard } from '~/components/conversion/ErrorCard'
import { QuotaBadge } from '~/components/conversion/QuotaBadge'
import { PaymentPrompt } from '~/components/conversion/PaymentPrompt'
import { PrivacyBadge } from '~/components/conversion/PrivacyBadge'
import { useConversionFlow } from '~/hooks/useConversionFlow'
import { deriveConversionRouteState, shouldSyncConversionSearch } from '~/lib/conversion-route-state'
import { callServerFn } from '~/lib/api-client'
import { MAX_FILE_SIZE } from '~/lib/file-validation'
import type { ServerConversionType } from '~/lib/conversions'
import type { RateLimitStatusResponse } from '~/server/api/contracts'
import { getRateLimitStatus } from '~/server/api/rate-limit-status'

const DEFAULT_PAYMENT_REQUIRED_MESSAGE = 'Free daily limit reached. Complete payment to continue.'

interface ServerConversionPageProps {
  conversion: ServerConversionType
  initialQuota: RateLimitStatusResponse | null
  search: {
    fileId?: string
    session_id?: string
    canceled?: boolean
  }
}

export function ServerConversionPage({ conversion, initialQuota, search }: ServerConversionPageProps) {
  const navigate = useNavigate({ from: '/$conversionType' })

  const syncFileIdInSearch = useCallback(
    (fileId: string | null) => {
      if (!shouldSyncConversionSearch(search, fileId)) {
        return
      }

      void navigate({
        to: '/$conversionType',
        params: { conversionType: conversion.slug },
        search: (prev) => ({
          ...prev,
          fileId: fileId ?? undefined,
          attemptId: undefined,
          session_id: undefined,
          canceled: undefined,
        }),
        replace: true,
        resetScroll: false,
      })
    },
    [conversion.slug, navigate, search],
  )

  const handleExpired = useCallback(() => {
    void navigate({
      to: '/$conversionType',
      params: { conversionType: conversion.slug },
      search: (prev) => ({
        ...prev,
        fileId: undefined,
        attemptId: undefined,
        session_id: undefined,
        canceled: undefined,
      }),
      replace: true,
      resetScroll: false,
    })
  }, [conversion.slug, navigate])

  const { initialFileId, initialState, initialCanceled } = deriveConversionRouteState({
    fileId: search.fileId,
    session_id: search.session_id,
    canceled: search.canceled,
  })

  const flow = useConversionFlow({
    conversionType: conversion.slug,
    initialFileId,
    initialState,
    initialCanceled,
    onFileIdChange: syncFileIdInSearch,
    onExpired: handleExpired,
  })

  const [quota, setQuota] = useState<RateLimitStatusResponse | null>(initialQuota)

  useEffect(() => {
    setQuota(initialQuota)
  }, [initialQuota])

  const fetchQuota = useCallback(async () => {
    const result = await callServerFn<RateLimitStatusResponse>(getRateLimitStatus)
    if (result.ok) {
      setQuota(result.data)
    }
  }, [])

  useEffect(() => {
    if (initialQuota == null && flow.state === 'idle') {
      void fetchQuota()
    }
  }, [fetchQuota, flow.state, initialQuota])

  useEffect(() => {
    if (
      flow.state === 'completed'
      || flow.state === 'failed'
      || flow.state === 'timeout'
      || flow.state === 'expired'
    ) {
      void fetchQuota()
    }
  }, [fetchQuota, flow.state])

  const maxSizeMB = MAX_FILE_SIZE / (1024 * 1024)

  const renderFlowSection = () => {
    if (flow.state === 'idle') {
      return (
        <FileUploader
          sourceExtensions={conversion.sourceExtensions}
          sourceMimeTypes={conversion.sourceMimeTypes}
          maxSizeMB={maxSizeMB}
          onFileSelected={(file) => void flow.startUpload(file)}
        />
      )
    }

    if (flow.state === 'uploading') {
      return <ConversionProgress progress={5} message='Uploading file...' />
    }

    if (flow.state === 'payment_required') {
      const paymentNotice =
        flow.canceledMessage
        ?? (flow.status?.message && flow.status.message !== DEFAULT_PAYMENT_REQUIRED_MESSAGE
          ? flow.status.message
          : undefined)

      return <PaymentPrompt fileId={flow.fileId!} notice={paymentNotice} />
    }

    if (flow.state === 'failed' || flow.state === 'timeout') {
      return (
        <ErrorCard
          errorCode={flow.error?.error}
          message={flow.error?.message ?? 'Something went wrong.'}
          onRetry={flow.reset}
        />
      )
    }

    if (flow.state === 'expired') {
      return (
        <ErrorCard
          message='Download window has expired. Please convert the file again.'
          onRetry={flow.reset}
        />
      )
    }

    if (flow.status) {
      return (
        <ConversionStatus
          status={flow.status}
          targetFormat={conversion.targetFormat}
          fileId={flow.fileId!}
          onReset={flow.reset}
          onExpired={flow.markExpired}
        />
      )
    }

    return <ConversionProgress progress={25} message='Starting conversion...' />
  }

  return (
    <PageShell>
      <ConversionHero conversion={conversion} />

      <div className='mt-8 space-y-6'>
        {quota && (
          <div className='flex justify-center'>
            <QuotaBadge remaining={quota.remaining} limit={quota.limit} />
          </div>
        )}

        <PrivacyBadge processingMode='server' />

        {renderFlowSection()}
      </div>

      <SEOContent html={conversion.seoContent} />
      <FAQSection faqs={conversion.faq} />
      <RelatedConversions slugs={conversion.relatedConversions} />
    </PageShell>
  )
}
