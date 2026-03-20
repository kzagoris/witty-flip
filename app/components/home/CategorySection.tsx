import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { ConversionGrid } from './ConversionGrid'
import type { ConversionCategoryGroup } from '~/lib/conversion-categories'

interface CategorySectionProps {
  group: ConversionCategoryGroup
  maxItems?: number
}

export function CategorySection({ group, maxItems = 6 }: CategorySectionProps) {
  const featuredConversions = group.conversions.slice(0, maxItems)

  return (
    <section className="py-8">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: group.conversions[0]?.formatColor ?? 'var(--color-primary)' }}
            />
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-muted-foreground">
              {group.shortTitle}
            </p>
          </div>

          <h3 className="mt-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {group.title}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            {group.homeDescription}
          </p>
        </div>

        {group.hubHref && group.hubLabel ? (
          <Link
            to={group.hubHref}
            className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted-foreground transition-colors hover:text-foreground lg:self-auto"
          >
            {group.hubLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>

      <ConversionGrid conversions={featuredConversions} />
    </section>
  )
}
