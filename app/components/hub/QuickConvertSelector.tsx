import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  buildQuickConvertSourceGroups,
  type QuickConvertSourceGroup,
} from '~/lib/conversion-categories'
import type { ConversionSummary } from '~/lib/conversion-summaries'

interface QuickConvertSelectorProps {
  conversions: ConversionSummary[]
  emptyStateMessage?: string
}

function findSourceGroup(
  sourceGroups: QuickConvertSourceGroup[],
  sourceFormat: string,
): QuickConvertSourceGroup | undefined {
  return sourceGroups.find((group) => group.sourceFormat === sourceFormat)
}

export function QuickConvertSelector({
  conversions,
  emptyStateMessage = 'This hub will populate automatically as the category grows.',
}: QuickConvertSelectorProps) {
  const sourceGroups = useMemo(() => buildQuickConvertSourceGroups(conversions), [conversions])
  const [sourceFormat, setSourceFormat] = useState(() => sourceGroups[0]?.sourceFormat ?? '')
  const availableTargets = useMemo(
    () => findSourceGroup(sourceGroups, sourceFormat)?.targets ?? [],
    [sourceFormat, sourceGroups],
  )
  const [targetSlug, setTargetSlug] = useState(() => availableTargets[0]?.slug ?? '')

  useEffect(() => {
    const firstGroup = sourceGroups[0]

    if (!firstGroup) {
      if (sourceFormat !== '') {
        setSourceFormat('')
      }
      return
    }

    if (!findSourceGroup(sourceGroups, sourceFormat)) {
      setSourceFormat(firstGroup.sourceFormat)
    }
  }, [sourceFormat, sourceGroups])

  useEffect(() => {
    const firstTarget = availableTargets[0]

    if (!firstTarget) {
      if (targetSlug !== '') {
        setTargetSlug('')
      }
      return
    }

    if (!availableTargets.some((target) => target.slug === targetSlug)) {
      setTargetSlug(firstTarget.slug)
    }
  }, [availableTargets, targetSlug])

  const selectedConversion = availableTargets.find((target) => target.slug === targetSlug)

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-primary/80">
          <Sparkles className="h-4 w-4" />
          Quick convert
        </div>
        <h2 className="mt-2 font-heading text-2xl font-bold tracking-tight text-neutral-900">
          Jump straight to the right tool
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Pick a source and target format, then open the matching converter page with the right
          processing details.
        </p>
      </div>

      {sourceGroups.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-neutral-50 p-4 text-sm leading-6 text-muted-foreground">
          {emptyStateMessage}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-neutral-900">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                From
              </span>
              <select
                className="h-11 w-full rounded-2xl border bg-white px-4 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                onChange={(event) => setSourceFormat(event.target.value)}
                value={sourceFormat}
              >
                {sourceGroups.map((group) => (
                  <option key={group.sourceFormat} value={group.sourceFormat}>
                    {group.sourceFormat.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-neutral-900">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                To
              </span>
              <select
                className="h-11 w-full rounded-2xl border bg-white px-4 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                onChange={(event) => setTargetSlug(event.target.value)}
                value={targetSlug}
              >
                {availableTargets.map((target) => (
                  <option key={target.slug} value={target.slug}>
                    {target.targetFormat.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedConversion ? (
            <Button asChild className="w-full gap-2 sm:w-auto">
              <Link to="/$conversionType" params={{ conversionType: selectedConversion.slug }}>
                Open {selectedConversion.sourceFormat.toUpperCase()} →{' '}
                {selectedConversion.targetFormat.toUpperCase()}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button className="w-full sm:w-auto" disabled>
              Open converter
            </Button>
          )}

          <p className="text-xs leading-5 text-muted-foreground">
            Need more context first? Every card below links to a dedicated page with browser versus
            server processing notes.
          </p>
        </>
      )}
    </div>
  )
}
