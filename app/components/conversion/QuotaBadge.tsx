import { Badge } from '~/components/ui/badge'
import { cn } from '~/lib/utils'

interface QuotaBadgeProps {
  remaining: number
  limit: number
}

export function QuotaBadge({ remaining, limit }: QuotaBadgeProps) {
  const hasRemaining = remaining > 0

  return (
    <Badge
      variant="outline"
      className={cn(
        'text-xs font-medium',
        hasRemaining
          ? 'border-green-300 bg-green-50 text-green-700'
          : 'border-amber-300 bg-amber-50 text-amber-700',
      )}
    >
      {remaining}/{limit} free conversions remaining
    </Badge>
  )
}
