import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import type { ConversionSummary } from '~/lib/conversion-summaries'

export function ConversionCard({ conversion }: { conversion: ConversionSummary }) {
  return (
    <Link to="/$conversionType" params={{ conversionType: conversion.slug }}>
      <Card
        className="group h-full cursor-pointer transition-all duration-200 hover:shadow-lg motion-safe:hover:scale-[1.02] border-l-4 border-l-transparent hover:border-l-[var(--card-accent)]"
        style={{ '--card-accent': conversion.formatColor } as React.CSSProperties}
      >
        <CardHeader>
          <div className="mb-2 flex items-center gap-2">
            <Badge
              variant="secondary"
              className="text-white"
              style={{ backgroundColor: conversion.formatColor }}
            >
              {conversion.sourceFormat.toUpperCase()}
            </Badge>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
            <Badge variant="outline">
              {conversion.targetFormat.toUpperCase()}
            </Badge>
          </div>
          <CardTitle className="font-heading text-lg">
            {conversion.sourceFormat.toUpperCase()} to {conversion.targetFormat.toUpperCase()}
          </CardTitle>
          <CardDescription className="line-clamp-2">
            {conversion.description}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <span className="text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            Convert now &rarr;
          </span>
        </CardFooter>
      </Card>
    </Link>
  )
}
