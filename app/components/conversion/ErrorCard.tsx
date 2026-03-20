import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '~/components/ui/button'

interface ErrorCardProps {
  errorCode?: string
  message: string
  onRetry?: () => void
}

export function ErrorCard({ errorCode, message, onRetry }: ErrorCardProps) {
  return (
    <div className="animate-scale-in space-y-3">
      <div className="rounded-lg border-l-4 border-l-destructive bg-secondary p-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <h4 className="text-sm font-medium text-foreground">
            {errorCode === 'conversion_timeout'
              ? 'Conversion Timed Out'
              : 'Conversion Failed'}
          </h4>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Try Again
        </Button>
      )}
    </div>
  )
}
