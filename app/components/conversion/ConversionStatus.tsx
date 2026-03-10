import type { ConversionStatusResponse } from '~/server/api/contracts'
import { statusToProgress } from '~/server/api/contracts'
import { ConversionProgress } from './ConversionProgress'
import { DownloadSection } from './DownloadSection'
import { ErrorCard } from './ErrorCard'
import { PaymentPrompt } from './PaymentPrompt'

const DEFAULT_PAYMENT_REQUIRED_MESSAGE = 'Free daily limit reached. Complete payment to continue.'

interface ConversionStatusProps {
  status: ConversionStatusResponse
  targetFormat: string
  fileId: string
  onReset: () => void
  onExpired?: () => void
}

export function ConversionStatus({ status, targetFormat, fileId, onReset, onExpired }: ConversionStatusProps) {
  switch (status.status) {
    case 'queued':
    case 'converting':
      return (
        <ConversionProgress
          progress={statusToProgress(status.status)}
          message={status.message}
        />
      )

    case 'pending_payment':
      return (
        <ConversionProgress
          progress={statusToProgress('pending_payment')}
          message={status.message ?? 'Processing payment...'}
        />
      )

    case 'completed':
      if (status.downloadUrl) {
        return (
            <DownloadSection
              downloadUrl={status.downloadUrl}
              expiresAt={status.expiresAt}
              targetFormat={targetFormat}
              onReset={onReset}
              onExpired={onExpired}
            />
        )
      }
      return (
        <ErrorCard
          message={status.message ?? 'The converted file is no longer available.'}
          onRetry={onReset}
        />
      )

    case 'payment_required':
      return (
        <PaymentPrompt
          fileId={fileId}
          notice={status.message && status.message !== DEFAULT_PAYMENT_REQUIRED_MESSAGE ? status.message : undefined}
        />
      )

    case 'failed':
    case 'timeout':
      return (
        <ErrorCard
          errorCode={status.errorCode}
          message={status.message ?? 'Conversion failed.'}
          onRetry={onReset}
        />
      )

    case 'expired':
      return (
        <ErrorCard
          message="Download window has expired. Please convert the file again."
          onRetry={onReset}
        />
      )

    default:
      return null
  }
}
