import { ConversionCard } from './ConversionCard'
import type { ConversionSummary } from '~/lib/conversion-summaries'

export function ConversionGrid({ conversions }: { conversions: ConversionSummary[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {conversions.map((c) => (
        <ConversionCard key={c.slug} conversion={c} />
      ))}
    </div>
  )
}
