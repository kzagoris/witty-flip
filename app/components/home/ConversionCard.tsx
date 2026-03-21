import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import type { ConversionSummary } from '~/lib/conversion-summaries'

export function ConversionCard({ conversion }: { conversion: ConversionSummary }) {
  const color = conversion.formatColor

  return (
    <Link
      to="/$conversionType"
      params={{ conversionType: conversion.slug }}
      className="group relative flex flex-col justify-between rounded-lg border bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
      style={{ borderTopWidth: '3px', borderTopColor: color }}
    >
      <div>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold tracking-wide text-white"
            style={{ backgroundColor: color }}
          >
            {conversion.sourceFormat.toUpperCase()}
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span
            className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold tracking-wide text-white"
            style={{ backgroundColor: color }}
          >
            {conversion.targetFormat.toUpperCase()}
          </span>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {conversion.description}
        </p>
      </div>

      <div className="mt-4 flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
        Convert now
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
      </div>
    </Link>
  )
}
