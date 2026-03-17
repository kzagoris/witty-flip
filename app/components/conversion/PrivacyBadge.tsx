import { LockKeyhole, MonitorSmartphone, Server } from 'lucide-react'
import { cn } from '~/lib/utils'

interface PrivacyBadgeProps {
  processingMode: 'client' | 'server'
  className?: string
}

export function PrivacyBadge({ processingMode, className }: PrivacyBadgeProps) {
  const isClient = processingMode === 'client'
  const Icon = isClient ? MonitorSmartphone : Server

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
        isClient
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : 'border-sky-200 bg-sky-50 text-sky-900',
        className,
      )}
    >
      <div
        className={cn(
          'rounded-full p-2',
          isClient ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700',
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2 font-medium">
          <LockKeyhole className="h-4 w-4" />
          <span>{isClient ? 'Processed in your browser' : 'Processed on our secure servers'}</span>
        </div>

        <p className={cn('text-xs leading-relaxed', isClient ? 'text-emerald-800' : 'text-sky-800')}>
          {isClient
            ? 'Your file stays on this device during conversion. Closing this tab clears the in-browser result.'
            : 'Uploaded files are stored temporarily for conversion and automatically deleted after the download window ends.'}
        </p>
      </div>
    </div>
  )
}
