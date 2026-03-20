import { useState, useEffect } from 'react'
import { Download, Clock, RefreshCw } from 'lucide-react'
import { Button } from '~/components/ui/button'

interface DownloadSectionProps {
  downloadUrl: string
  expiresAt?: string
  targetFormat: string
  onReset: () => void
  onExpired?: () => void
}

function useCountdown(expiresAt?: string, onExpired?: () => void) {
  const [remaining, setRemaining] = useState('')

  useEffect(() => {
    if (!expiresAt) return

    let didNotifyExpired = false

    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now()
      if (diff <= 0) {
        setRemaining('Expired')
        if (!didNotifyExpired) {
          didNotifyExpired = true
          onExpired?.()
        }
        return
      }
      const minutes = Math.floor(diff / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)
      setRemaining(`${minutes}m ${seconds}s`)
    }

    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [expiresAt, onExpired])

  return remaining
}

export function DownloadSection({ downloadUrl, expiresAt, targetFormat, onReset, onExpired }: DownloadSectionProps) {
  const countdown = useCountdown(expiresAt, onExpired)

  return (
    <div className="animate-scale-in rounded-lg border-l-4 border-l-[var(--color-success)] bg-[oklch(0.52_0.14_155/0.04)] p-6">
      <div className="flex items-center gap-3">
        <Download className="h-5 w-5 text-[var(--color-success)]" />
        <h3 className="font-heading text-lg font-semibold text-foreground">
          Conversion Complete
        </h3>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Your {targetFormat.toUpperCase()} file is ready to download.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button asChild size="lg">
          <a href={downloadUrl} download>
            <Download className="h-4 w-4" />
            Download {targetFormat.toUpperCase()}
          </a>
        </Button>

        {countdown && countdown !== 'Expired' && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Deleted in {countdown}
          </span>
        )}
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
