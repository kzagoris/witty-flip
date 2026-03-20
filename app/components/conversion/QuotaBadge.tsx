import { cn } from '~/lib/utils'

interface QuotaBadgeProps {
  remaining: number
  limit: number
}

export function QuotaBadge({ remaining, limit }: QuotaBadgeProps) {
  const hasRemaining = remaining > 0

  return (
    <span
      className={cn(
        'text-[11px] text-muted-foreground',
        !hasRemaining && 'text-[var(--color-warning)]',
      )}
    >
      {remaining}/{limit} free conversions remaining
    </span>
  )
}
