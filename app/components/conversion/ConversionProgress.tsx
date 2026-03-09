import { Progress } from '~/components/ui/progress'
import { Loader2 } from 'lucide-react'

interface ConversionProgressProps {
  progress: number
  message?: string
}

export function ConversionProgress({ progress, message }: ConversionProgressProps) {
  return (
    <div className="animate-fade-in space-y-4 rounded-xl border bg-white p-6">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-sm font-medium text-neutral-700">
          {message ?? 'Processing...'}
        </span>
      </div>
      <Progress value={progress} className="h-2.5" />
      <p className="text-xs text-muted-foreground">
        {progress}% complete
      </p>
    </div>
  )
}
