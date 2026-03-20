import { useMemo } from 'react'
import { AlertTriangle, Download, RefreshCw } from 'lucide-react'
import { Button } from '~/components/ui/button'
import type { ClientConversionResult } from '~/lib/client-converters/types'

interface ClientDownloadSectionProps {
  result: ClientConversionResult
  onDownload: () => void
  onReset: () => void
  bookkeepingWarning?: string
}

function formatBytes(sizeBytes?: number): string | null {
  if (sizeBytes == null || sizeBytes <= 0) {
    return null
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
}

export function ClientDownloadSection({ result, onDownload, onReset, bookkeepingWarning }: ClientDownloadSectionProps) {
  const sizeLabel = useMemo(() => {
    const sizeBytes = result.kind === 'binary'
      ? result.blob?.size
      : typeof result.text === 'string'
        ? new TextEncoder().encode(result.text).byteLength
        : undefined
    return formatBytes(sizeBytes)
  }, [result])

  return (
    <div className="animate-scale-in rounded-lg border-l-4 border-l-[var(--color-success)] bg-[oklch(0.52_0.14_155/0.04)] p-6">
      <div className="flex items-center gap-3">
        <Download className="h-5 w-5 text-[var(--color-success)]" />
        <h3 className="font-heading text-lg font-semibold text-foreground">Conversion complete</h3>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Your converted file is ready in this browser session.
      </p>
      <p className="text-xs text-muted-foreground">
        {result.filename}
        {sizeLabel ? ` · ${sizeLabel}` : ''}
      </p>

      <div className="mt-4">
        <Button
          type="button"
          size="lg"
          onClick={onDownload}
        >
          <Download className="h-4 w-4" />
          Download file
        </Button>
      </div>

      {bookkeepingWarning && (
        <div className="mt-4 rounded-lg border-l-4 border-l-[var(--color-warning)] bg-secondary px-4 py-3 text-sm">
          <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
            <AlertTriangle className="h-4 w-4" />
            Server sync notice
          </div>
          <p className="text-xs text-muted-foreground">
            {bookkeepingWarning}
          </p>
        </div>
      )}

      {result.warnings && result.warnings.length > 0 && (
        <div className="mt-4 rounded-lg border-l-4 border-l-[var(--color-warning)] bg-secondary px-4 py-3 text-sm">
          <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
            <AlertTriangle className="h-4 w-4" />
            Conversion notes
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {result.warnings.map((warning) => (
              <li key={warning.code}>
                <span className="font-medium">{warning.message}</span>
                {warning.details && warning.details.length > 0 && (
                  <span>{` (${warning.details.join('; ')})`}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-lg border-l-4 border-l-[var(--color-warning)] bg-secondary px-4 py-3 text-sm">
        <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
          <AlertTriangle className="h-4 w-4" />
          Keep this tab open until you download
        </div>
        <p className="text-xs text-muted-foreground">
          Client-side conversion results live only in memory. Refreshing or closing this tab discards the generated file.
        </p>
      </div>

      <button
        onClick={onReset}
        className="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Convert another file
      </button>
    </div>
  )
}
