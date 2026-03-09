import type { ReactNode } from 'react'

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      {children}
    </main>
  )
}
