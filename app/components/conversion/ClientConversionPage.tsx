import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { PageShell } from '~/components/layout/PageShell'
import { ConversionHero } from '~/components/conversion/ConversionHero'
import { SEOContent } from '~/components/conversion/SEOContent'
import { FAQSection } from '~/components/conversion/FAQSection'
import { RelatedConversions } from '~/components/conversion/RelatedConversions'
import { FileUploader } from '~/components/conversion/FileUploader'
import { ConversionProgress } from '~/components/conversion/ConversionProgress'
import { ErrorCard } from '~/components/conversion/ErrorCard'
import { QuotaBadge } from '~/components/conversion/QuotaBadge'
import { PaymentPrompt } from '~/components/conversion/PaymentPrompt'
import { ConversionOptions } from '~/components/conversion/ConversionOptions'
import { ClientDownloadSection } from '~/components/conversion/ClientDownloadSection'
import { PrivacyBadge } from '~/components/conversion/PrivacyBadge'
import { Button } from '~/components/ui/button'
import { useClientConversionFlow } from '~/hooks/useClientConversionFlow'
import { deriveClientConversionRouteState, shouldSyncClientConversionSearch } from '~/lib/conversion-route-state'
import { callServerFn } from '~/lib/api-client'
import { MAX_FILE_SIZE } from '~/lib/file-validation'
import type { ClientConversionType } from '~/lib/conversions'
import type { RateLimitStatusResponse } from '~/server/api/contracts'
import { getRateLimitStatus } from '~/server/api/rate-limit-status'

interface ClientConversionPageProps {
  conversion: ClientConversionType
  initialQuota: RateLimitStatusResponse | null
  search: {
    attemptId?: string
    session_id?: string
    canceled?: boolean
  }
}

export function ClientConversionPage({ conversion, initialQuota, search }: ClientConversionPageProps) {
  const navigate = useNavigate({ from: '/$conversionType' })

  const syncAttemptIdInSearch = useCallback(
    (attemptId: string | null) => {
      if (!shouldSyncClientConversionSearch(search, attemptId)) {
        return
      }

      void navigate({
        to: '/$conversionType',
        params: { conversionType: conversion.slug },
        search: (prev) => ({
          ...prev,
          fileId: undefined,
          attemptId: attemptId ?? undefined,
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

  const { initialAttemptId, initialState, initialCanceled } = deriveClientConversionRouteState({
    attemptId: search.attemptId,
    session_id: search.session_id,
    canceled: search.canceled,
  })

  const flow = useClientConversionFlow({
    conversion,
    initialAttemptId,
    initialState,
    initialCanceled,
    onAttemptIdChange: syncAttemptIdInSearch,
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
    if (initialQuota == null && flow.state === 'idle' && !flow.attemptId) {
      void fetchQuota()
    }
  }, [fetchQuota, flow.attemptId, flow.state, initialQuota])

  useEffect(() => {
    if (flow.state === 'completed' || flow.state === 'failed' || flow.state === 'expired') {
      void fetchQuota()
    }
  }, [fetchQuota, flow.state])

  const maxSizeMB = conversion.maxFileSizeMB ?? MAX_FILE_SIZE / (1024 * 1024)
  const showConversionOptions = useMemo(
    () => conversion.sourceFormat === 'webp' || conversion.targetFormat === 'webp',
    [conversion.sourceFormat, conversion.targetFormat],
  )
  const isBusy = flow.state === 'reserving' || flow.state === 'pending_payment' || flow.state === 'converting'
  const paymentNotice = flow.canceledMessage ?? flow.status?.message

  const renderFlowSection = () => {
    if (flow.state === 'completed' && flow.result) {
      return (
        <ClientDownloadSection
          result={flow.result}
          onDownload={flow.downloadResult}
          onReset={flow.reset}
        />
      )
    }

    if (flow.state === 'payment_required') {
      return (
        <PaymentPrompt
          attemptId={flow.attemptId!}
          notice={paymentNotice}
        />
      )
    }

    if (flow.state === 'failed') {
      return (
        <ErrorCard
          errorCode={flow.error?.error}
          message={flow.error?.message ?? 'Client conversion failed.'}
          onRetry={flow.reset}
        />
      )
    }

    if (flow.state === 'expired') {
      return (
        <ErrorCard
          message='This client conversion attempt expired. Please start again.'
          onRetry={flow.reset}
        />
      )
    }

    if (flow.state === 'reserving' || flow.state === 'pending_payment' || flow.state === 'converting') {
      return <ConversionProgress progress={flow.progress} message={flow.progressMessage} />
    }

    if (flow.enhancedLoadFailed) {
      return (
        <div className='rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-3'>
          <p className='text-sm text-amber-900'>
            Enhanced quality couldn't load. You can retry or continue with Standard mode.
          </p>
          <div className='flex gap-3'>
            <Button variant='outline' size='sm' onClick={flow.retryEnhanced}>
              Retry Enhanced
            </Button>
            <Button size='sm' onClick={flow.switchToStandard}>
              Continue in Standard
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className='space-y-4'>
        {flow.needsFileReselection && flow.reselectionMessage && (
          <div className='rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900'>
            {flow.reselectionMessage}
          </div>
        )}

        <FileUploader
          sourceExtensions={conversion.sourceExtensions}
          sourceMimeTypes={conversion.sourceMimeTypes}
          maxSizeMB={maxSizeMB}
          disabled={isBusy}
          onFileSelected={(file) => void flow.startConversion(file)}
        />
      </div>
    )
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

        <PrivacyBadge processingMode='client' />

        {renderFlowSection()}

        {showConversionOptions && (
          <ConversionOptions
            processingMode={flow.processingMode}
            onProcessingModeChange={flow.setProcessingMode}
            quality={flow.quality}
            onQualityChange={flow.setQuality}
            disabled={isBusy}
            hasEnhancedMode={flow.supportsEnhancedMode}
          />
        )}
      </div>

      <SEOContent html={conversion.seoContent} />
      <FAQSection faqs={conversion.faq} />
      <RelatedConversions slugs={conversion.relatedConversions} />
    </PageShell>
  )
}
