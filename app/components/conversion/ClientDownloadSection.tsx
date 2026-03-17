import { useMemo } from 'react'
import { AlertTriangle, Download, RefreshCw } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import type { ClientConversionResult } from '~/lib/client-converters/types'

interface ClientDownloadSectionProps {
  result: ClientConversionResult
  onDownload: () => void
  onReset: () => void
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

export function ClientDownloadSection({ result, onDownload, onReset }: ClientDownloadSectionProps) {
  const sizeLabel = useMemo(() => {
    const sizeBytes = result.kind === 'binary'
      ? result.blob?.size
      : typeof result.text === 'string'
        ? new TextEncoder().encode(result.text).byteLength
        : undefined
    return formatBytes(sizeBytes)
  }, [result])

  return (
    <Card className="border-emerald-200 bg-emerald-50 shadow-sm">
      <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
        <div className="rounded-full bg-emerald-100 p-3 text-emerald-700">
          <Download className="h-8 w-8" />
        </div>

        <div className="space-y-1">
          <h3 className="font-heading text-lg font-bold text-emerald-900">Conversion complete</h3>
          <p className="text-sm text-emerald-800">
            Your converted file is ready in this browser session.
          </p>
          <p className="text-xs text-emerald-700">
            {result.filename}
            {sizeLabel ? ` · ${sizeLabel}` : ''}
          </p>
        </div>

        <Button
          type="button"
          size="lg"
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={onDownload}
        >
          <Download className="h-4 w-4" />
          Download file
        </Button>

        {result.warnings && result.warnings.length > 0 && (
          <div className="w-full rounded-lg border border-amber-200 bg-white/80 px-4 py-3 text-left text-sm text-amber-900">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" />
              Conversion notes
            </div>
            <ul className="space-y-1 text-xs text-amber-800">
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

        <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Keep this tab open until you download
          </div>
          <p className="text-xs text-amber-800">
            Client-side conversion results live only in memory. Refreshing or closing this tab discards the generated file.
          </p>
        </div>

        <Button variant="ghost" size="sm" onClick={onReset} className="text-emerald-800">
          <RefreshCw className="h-3.5 w-3.5" />
          Convert another file
        </Button>
      </CardContent>
    </Card>
  )
}
