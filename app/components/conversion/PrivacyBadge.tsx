import { MonitorSmartphone, Server } from 'lucide-react'
import { cn } from '~/lib/utils'

interface PrivacyBadgeProps {
  processingMode: 'client' | 'server'
  className?: string
}

export function PrivacyBadge({ processingMode, className }: PrivacyBadgeProps) {
  const isClient = processingMode === 'client'
  const Icon = isClient ? MonitorSmartphone : Server

  return (
    <p
      role="status"
      className={cn(
        'flex items-center gap-2 text-sm text-muted-foreground',
        className,
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{isClient ? 'Processed in your browser' : 'Processed on our secure servers'}</span>
    </p>
  )
}
