import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { PageShell } from '~/components/layout/PageShell'
import { Badge } from '~/components/ui/badge'

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
      <section className="relative overflow-hidden rounded-[2rem] border bg-gradient-to-br from-sky-50 via-white to-fuchsia-50 p-6 shadow-sm sm:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.14)_0%,_transparent_55%)]" />

        <div className="relative z-10">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            {breadcrumbs.map((breadcrumb, index) => {
              const isLast = index === breadcrumbs.length - 1

              return (
                <div key={`${breadcrumb.label}-${index}`} className="flex items-center gap-2">
                  {breadcrumb.href && !isLast ? (
                    <a className="transition-colors hover:text-neutral-900" href={breadcrumb.href}>
                      {breadcrumb.label}
                    </a>
                  ) : (
                    <span className={isLast ? 'font-medium text-neutral-900' : undefined}>
                      {breadcrumb.label}
                    </span>
                  )}

                  {!isLast ? <ChevronRight className="h-4 w-4" /> : null}
                </div>
              )
            })}
          </nav>

          <div className="mt-5 grid gap-8 lg:grid-cols-[1.15fr,0.85fr] lg:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">
                {eyebrow}
              </p>
              <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
                {title}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
                {description}
              </p>

              {highlights.length > 0 ? (
                <div className="mt-6 flex flex-wrap gap-2">
                  {highlights.map((highlight) => (
                    <Badge
                      key={highlight}
                      variant="outline"
                      className="rounded-full border-white/70 bg-white/80 px-3 py-1 text-sm text-neutral-700"
                    >
                      {highlight}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            {quickConvert ? (
              <div className="rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-sm backdrop-blur-sm">
                {quickConvert}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="mt-10">{children}</div>
    </PageShell>
  )
}
