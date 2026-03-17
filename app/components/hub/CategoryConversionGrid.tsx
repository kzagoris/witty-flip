import { Badge } from '~/components/ui/badge'
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
    <section className="rounded-[1.75rem] border bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.26em] text-muted-foreground">
          Category tools
        </p>
        <Badge variant="outline">
          {conversions.length} {conversions.length === 1 ? 'converter' : 'converters'}
        </Badge>
      </div>

      <div className="max-w-3xl">
        <h2 className="font-heading text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
      </div>

      <div className="mt-6">
        {conversions.length > 0 ? (
          <ConversionGrid conversions={conversions} />
        ) : (
          <div className="rounded-[1.5rem] border border-dashed bg-neutral-50 p-8 text-center">
            <h3 className="font-heading text-xl font-semibold text-neutral-900">{emptyStateTitle}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{emptyStateDescription}</p>
          </div>
        )}
      </div>
    </section>
  )
}
