import { CategorySection } from './CategorySection'
import { groupConversionSummariesByCategory } from '~/lib/conversion-categories'
import type { ConversionSummary } from '~/lib/conversion-summaries'

const reasons = [
  {
    title: 'Privacy-first processing',
    description:
      'Many conversions can stay in your browser. When a job needs our servers, the retention window is explicit.',
  },
  {
    title: 'Auto-deleted server jobs',
    description:
      'Server-side outputs are temporary by design so files do not linger longer than they need to.',
  },
  {
    title: 'No subscription traps',
    description:
      'Use the free daily allowance, then unlock extra conversions per file instead of committing to a plan.',
  },
  {
    title: 'Focused catalog',
    description:
      'WittyFlip favors high-intent workflows over a bloated directory, so navigation stays clear.',
  },
]

export function CategorizedConversionGrid({ conversions }: { conversions: ConversionSummary[] }) {
  const groups = groupConversionSummariesByCategory(conversions)

  return (
    <section className="mt-12 space-y-4">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Explore by category
        </p>
        <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Start with the workflow, not a random list of formats
        </h2>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          WittyFlip organizes conversions around the tasks people actually have to finish: browser-based
          image cleanups, document exports, ebook compatibility, and other focused format changes.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-secondary p-8 text-sm text-muted-foreground">
          No converters are available yet.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {groups.map((group) => <CategorySection key={group.category} group={group} />)}
        </div>
      )}

      <section className="mt-16 sm:mt-20">
        <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          Built for clear privacy choices and predictable conversions
        </h2>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div className="space-y-6">
            {reasons.slice(0, 2).map(({ title, description }) => (
              <div key={title}>
                <h3 className="font-heading text-lg font-medium">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
          <div className="space-y-6">
            {reasons.slice(2).map(({ title, description }) => (
              <div key={title}>
                <h3 className="font-heading text-lg font-medium">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </section>
  )
}
