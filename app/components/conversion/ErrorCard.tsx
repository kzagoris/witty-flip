import { AlertCircle, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'

interface ErrorCardProps {
  errorCode?: string
  message: string
  onRetry?: () => void
}

export function ErrorCard({ errorCode, message, onRetry }: ErrorCardProps) {
  return (
    <div className="motion-safe:animate-shake space-y-3">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>
          {errorCode === 'conversion_timeout'
            ? 'Conversion Timed Out'
            : 'Conversion Failed'}
        </AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Try Again
        </Button>
      )}
    </div>
  )
}
