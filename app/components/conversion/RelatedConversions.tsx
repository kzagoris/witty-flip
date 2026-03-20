import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { getConversionSummaryBySlug } from '~/lib/conversion-summaries'

export function RelatedConversions({ slugs }: { slugs: string[] }) {
  const related = slugs
    .map((slug) => getConversionSummaryBySlug(slug))
    .filter((c): c is NonNullable<typeof c> => c != null)

  if (related.length === 0) return null

  return (
    <section className="mt-16 sm:mt-20">
      <h2 className="font-heading text-lg font-medium">Related Conversions</h2>
      <div className="mt-4 grid grid-cols-1 gap-0 sm:grid-cols-2">
        {related.map((c) => (
          <Link
            key={c.slug}
            to="/$conversionType"
            params={{ conversionType: c.slug }}
            className="group flex items-center justify-between border-b py-3 transition-colors hover:text-primary"
          >
            <span className="text-sm font-medium">
              {c.sourceFormat.toUpperCase()} &rarr; {c.targetFormat.toUpperCase()}
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </section>
  )
}
