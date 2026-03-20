import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import type { ConversionSummary } from '~/lib/conversion-summaries'

export function ConversionCard({ conversion }: { conversion: ConversionSummary }) {
  return (
    <Link
      to="/$conversionType"
      params={{ conversionType: conversion.slug }}
      className="group flex items-center justify-between border-b py-4 transition-colors hover:text-primary"
    >
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-foreground group-hover:text-primary">
          {conversion.sourceFormat.toUpperCase()} &rarr; {conversion.targetFormat.toUpperCase()}
        </span>
        <span className="text-sm text-muted-foreground line-clamp-1 hidden sm:inline">
          {conversion.description}
        </span>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-primary" />
    </Link>
  )
}
