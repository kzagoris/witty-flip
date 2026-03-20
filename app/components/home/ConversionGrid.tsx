import { ConversionCard } from './ConversionCard'
import type { ConversionSummary } from '~/lib/conversion-summaries'

export function ConversionGrid({ conversions }: { conversions: ConversionSummary[] }) {
  return (
    <div className="divide-y divide-border">
      {conversions.map((c) => (
        <ConversionCard key={c.slug} conversion={c} />
      ))}
    </div>
  )
}
