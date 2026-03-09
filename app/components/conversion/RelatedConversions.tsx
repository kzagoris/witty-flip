import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { getConversionSummaryBySlug } from '~/lib/conversion-summaries'

export function RelatedConversions({ slugs }: { slugs: string[] }) {
  const related = slugs
    .map((slug) => getConversionSummaryBySlug(slug))
    .filter((c): c is NonNullable<typeof c> => c != null)

  if (related.length === 0) return null

  return (
    <section className="mt-10">
      <h2 className="mb-4 font-heading text-2xl font-bold">Related Conversions</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {related.map((c) => (
          <Link key={c.slug} to="/$conversionType" params={{ conversionType: c.slug }}>
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader className="p-4">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="text-white"
                    style={{ backgroundColor: c.formatColor }}
                  >
                    {c.sourceFormat.toUpperCase()}
                  </Badge>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <Badge variant="outline">{c.targetFormat.toUpperCase()}</Badge>
                </div>
                <CardTitle className="mt-1 text-sm font-medium">
                  {c.heading}
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}
