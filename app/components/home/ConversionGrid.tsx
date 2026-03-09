import { ConversionCard } from './ConversionCard'
import type { ConversionSummary } from '~/lib/conversion-summaries'

export function ConversionGrid({ conversions }: { conversions: ConversionSummary[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {conversions.map((c) => (
        <ConversionCard key={c.slug} conversion={c} />
      ))}
    </div>
  )
}
