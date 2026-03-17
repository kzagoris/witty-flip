import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight, BookOpen, Braces, FileText, Images } from 'lucide-react'
import { ConversionGrid } from './ConversionGrid'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import type { ConversionCategoryGroup } from '~/lib/conversion-categories'
import type { ConversionCategory } from '~/lib/conversions'
import { cn } from '~/lib/utils'

const categoryIcons: Record<ConversionCategory, LucideIcon> = {
  image: Images,
  developer: Braces,
  document: FileText,
  ebook: BookOpen,
}

const categoryAccentClasses: Record<ConversionCategory, string> = {
  image: 'bg-fuchsia-100 text-fuchsia-700',
  developer: 'bg-amber-100 text-amber-700',
  document: 'bg-sky-100 text-sky-700',
  ebook: 'bg-emerald-100 text-emerald-700',
}

interface CategorySectionProps {
  group: ConversionCategoryGroup
  maxItems?: number
}

export function CategorySection({ group, maxItems = 6 }: CategorySectionProps) {
  const Icon = categoryIcons[group.category]
  const featuredConversions = group.conversions.slice(0, maxItems)

  return (
    <section className="rounded-[1.75rem] border bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={cn(
                'inline-flex h-10 w-10 items-center justify-center rounded-2xl',
                categoryAccentClasses[group.category],
              )}
            >
              <Icon className="h-4 w-4" />
            </span>

            <p className="text-sm font-semibold uppercase tracking-[0.26em] text-muted-foreground">
              {group.shortTitle}
            </p>

            <Badge variant="outline">
              {group.conversions.length} {group.conversions.length === 1 ? 'tool' : 'tools'}
            </Badge>
          </div>

          <div>
            <h3 className="font-heading text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
              {group.title}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              {group.homeDescription}
            </p>
          </div>
        </div>

        {group.hubHref && group.hubLabel ? (
          <Button asChild variant="outline" className="gap-2 self-start lg:self-auto">
            <Link to={group.hubHref}>
              {group.hubLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : null}
      </div>

      <ConversionGrid conversions={featuredConversions} />
    </section>
  )
}
