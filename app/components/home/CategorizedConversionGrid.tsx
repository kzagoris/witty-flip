import type { LucideIcon } from 'lucide-react'
import {
  CreditCard,
  LayoutPanelTop,
  MonitorSmartphone,
  ShieldCheck,
} from 'lucide-react'
import { CategorySection } from './CategorySection'
import { groupConversionSummariesByCategory } from '~/lib/conversion-categories'
import type { ConversionSummary } from '~/lib/conversion-summaries'

const reasons: Array<{
  title: string
  description: string
  icon: LucideIcon
}> = [
  {
    title: 'Privacy-first processing',
    description:
      'Many conversions can stay in your browser. When a job needs our servers, the retention window is explicit.',
    icon: MonitorSmartphone,
  },
  {
    title: 'Auto-deleted server jobs',
    description:
      'Server-side outputs are temporary by design so files do not linger longer than they need to.',
    icon: ShieldCheck,
  },
  {
    title: 'No subscription traps',
    description:
      'Use the free daily allowance, then unlock extra conversions per file instead of committing to a plan.',
    icon: CreditCard,
  },
  {
    title: 'Focused catalog',
    description:
      'WittyFlip favors high-intent workflows over a bloated directory, so navigation stays clear.',
    icon: LayoutPanelTop,
  },
]

export function CategorizedConversionGrid({ conversions }: { conversions: ConversionSummary[] }) {
  const groups = groupConversionSummariesByCategory(conversions)

  return (
    <section className="mt-12 space-y-8">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Explore by category
        </p>
        <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
          Start with the workflow, not a random list of formats
        </h2>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          WittyFlip organizes conversions around the tasks people actually have to finish: browser-based
          image cleanups, document exports, ebook compatibility, and other focused format changes.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-[1.75rem] border border-dashed bg-neutral-50 p-8 text-sm text-muted-foreground">
          No converters are available yet.
        </div>
      ) : (
        groups.map((group) => <CategorySection key={group.category} group={group} />)
      )}

      <section className="rounded-[1.75rem] border bg-gradient-to-br from-neutral-50 via-white to-sky-50 p-6 shadow-sm sm:p-8">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-muted-foreground">
            Why WittyFlip
          </p>
          <h2 className="mt-3 font-heading text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            Built for clear privacy choices and predictable conversions
          </h2>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {reasons.map(({ title, description, icon: Icon }) => (
            <div
              key={title}
              className="rounded-2xl border bg-white/80 p-5 shadow-sm backdrop-blur-sm"
            >
              <div className="inline-flex rounded-2xl bg-primary/10 p-2 text-primary">
                <Icon className="h-4 w-4" />
              </div>

              <h3 className="mt-4 font-heading text-lg font-semibold text-neutral-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </section>
  )
}
