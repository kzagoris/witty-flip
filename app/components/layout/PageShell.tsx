import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

interface PageShellProps {
  children: ReactNode
  variant?: 'default' | 'narrow' | 'wide'
}

const variantClasses = {
  default: 'max-w-6xl',
  narrow: 'max-w-3xl',
  wide: 'max-w-7xl',
} as const

export function PageShell({ children, variant = 'default' }: PageShellProps) {
  return (
    <main className={cn('mx-auto w-full px-5 py-10 sm:px-8 sm:py-14 lg:px-12', variantClasses[variant])}>
      {children}
    </main>
  )
}
