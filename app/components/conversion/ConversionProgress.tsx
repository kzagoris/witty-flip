import { Progress } from '~/components/ui/progress'

interface ConversionProgressProps {
  progress: number
  message?: string
}

export function ConversionProgress({ progress, message }: ConversionProgressProps) {
  return (
    <div className="animate-fade-in space-y-3 rounded-lg bg-secondary p-6">
      <span className="text-sm font-medium text-foreground">
        {message ?? 'Processing...'}
      </span>
      <Progress value={progress} className="h-1.5" />
    </div>
  )
}
