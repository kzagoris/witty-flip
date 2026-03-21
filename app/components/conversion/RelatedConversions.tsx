import { getConversionSummaryBySlug } from '~/lib/conversion-summaries'
import { ConversionGrid } from '~/components/home/ConversionGrid'

export function RelatedConversions({ slugs }: { slugs: string[] }) {
  const related = slugs
    .map((slug) => getConversionSummaryBySlug(slug))
    .filter((c): c is NonNullable<typeof c> => c != null)

  if (related.length === 0) return null

  return (
    <section className="mt-16 sm:mt-20">
      <h2 className="font-heading text-lg font-medium">Related Conversions</h2>
      <div className="mt-4">
        <ConversionGrid conversions={related} />
      </div>
    </section>
  )
}
