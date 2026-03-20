import type { ReactNode } from 'react'
import { PageShell } from '~/components/layout/PageShell'

interface HubBreadcrumb {
  label: string
  href?: string
}

interface HubPageProps {
  breadcrumbs: HubBreadcrumb[]
  eyebrow: string
  title: string
  description: string
  highlights?: string[]
  quickConvert?: ReactNode
  children: ReactNode
}

export function HubPage({
  breadcrumbs,
  eyebrow,
  title,
  description,
  highlights = [],
  quickConvert,
  children,
}: HubPageProps) {
  return (
    <PageShell>
      <section>
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
        >
          {breadcrumbs.map((breadcrumb, index) => {
            const isLast = index === breadcrumbs.length - 1

            return (
              <span key={`${breadcrumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 && <span>/</span>}
                {breadcrumb.href && !isLast ? (
                  <a className="transition-colors hover:text-foreground" href={breadcrumb.href}>
                    {breadcrumb.label}
                  </a>
                ) : (
                  <span className={isLast ? 'text-foreground' : undefined}>
                    {breadcrumb.label}
                  </span>
                )}
              </span>
            )
          })}
        </nav>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.15fr,0.85fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">
              {eyebrow}
            </p>
            <h1 className="mt-4 font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
              {title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
              {description}
            </p>

            {highlights.length > 0 ? (
              <div className="mt-6 flex flex-wrap gap-2">
                {highlights.map((highlight) => (
                  <span
                    key={highlight}
                    className="rounded-full bg-secondary px-3 py-1 text-sm text-muted-foreground"
                  >
                    {highlight}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {quickConvert ? (
            <div className="rounded-lg bg-secondary p-5">
              {quickConvert}
            </div>
          ) : null}
        </div>
      </section>

      <div className="mt-10">{children}</div>
    </PageShell>
  )
}
