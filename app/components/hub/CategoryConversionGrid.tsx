import { ConversionGrid } from '~/components/home/ConversionGrid'
import type { ConversionSummary } from '~/lib/conversion-summaries'

interface CategoryConversionGridProps {
  title: string
  description: string
  conversions: ConversionSummary[]
  emptyStateTitle?: string
  emptyStateDescription?: string
}

export function CategoryConversionGrid({
  title,
  description,
  conversions,
  emptyStateTitle = 'No conversions are available yet',
  emptyStateDescription = 'Check back soon for more category tools.',
}: CategoryConversionGridProps) {
  return (
    <section>
      <div className="mb-4 text-xs font-semibold uppercase tracking-[0.26em] text-muted-foreground">
        {conversions.length} {conversions.length === 1 ? 'converter' : 'converters'}
      </div>

      <div className="max-w-3xl">
        <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
      </div>

      <div className="mt-6">
        {conversions.length > 0 ? (
          <ConversionGrid conversions={conversions} />
        ) : (
          <div className="rounded-lg border border-dashed bg-secondary p-8 text-center">
            <h3 className="font-heading text-xl font-semibold">{emptyStateTitle}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{emptyStateDescription}</p>
          </div>
        )}
      </div>
    </section>
  )
}
