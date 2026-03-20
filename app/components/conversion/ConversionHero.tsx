import { Link } from '@tanstack/react-router'
import type { ConversionType } from '~/lib/conversions'

export function ConversionHero({ conversion }: { conversion: ConversionType }) {
  return (
    <section className="space-y-4">
      <nav className="text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/" className="transition-colors hover:text-foreground">Home</Link>
        <span className="mx-2">&gt;</span>
        <span className="text-foreground">{conversion.sourceFormat.toUpperCase()} to {conversion.targetFormat.toUpperCase()}</span>
      </nav>

      <div className="flex items-center gap-3">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: conversion.formatColor }}
        />
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          {conversion.seo.h1}
        </h1>
      </div>
      <p className="text-muted-foreground">
        Free, fast, and private &mdash; no signup required
      </p>
    </section>
  )
}
