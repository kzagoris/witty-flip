import { useState, useEffect } from 'react'
import { Download, Clock, RefreshCw } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'

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
    <Card className="motion-safe:animate-celebrate border-green-200 bg-green-50">
      <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
        <div className="rounded-full bg-green-100 p-3 text-green-600 motion-safe:animate-bounce-in">
          <Download className="h-8 w-8" />
        </div>

        <div>
          <h3 className="font-heading text-lg font-bold text-green-800">
            Conversion Complete!
          </h3>
          <p className="mt-1 text-sm text-green-700">
            Your {targetFormat.toUpperCase()} file is ready to download.
          </p>
        </div>

        <Button asChild size="lg" className="bg-green-600 hover:bg-green-700 motion-safe:animate-bounce-subtle">
          <a href={downloadUrl} download>
            <Download className="h-4 w-4" />
            Download {targetFormat.toUpperCase()}
          </a>
        </Button>

        {countdown && countdown !== 'Expired' && (
          <div className="flex items-center gap-1.5 text-xs text-green-600">
            <Clock className="h-3.5 w-3.5" />
            <span>Your file will be deleted in {countdown}</span>
          </div>
        )}

        <Button variant="ghost" size="sm" onClick={onReset} className="text-green-700">
          <RefreshCw className="h-3.5 w-3.5" />
          Convert another file
        </Button>
      </CardContent>
    </Card>
  )
}
