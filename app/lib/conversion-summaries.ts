import {
  getAllConversionTypes,
  type ConversionCategory,
  type ConversionType,
} from './conversions'

export interface ConversionSummary {
  slug: string
  category: ConversionCategory
  sourceFormat: string
  targetFormat: string
  formatColor: string
  description: string
  heading: string
}

export function toConversionSummary(conversion: ConversionType): ConversionSummary {
  return {
    slug: conversion.slug,
    category: conversion.category,
    sourceFormat: conversion.sourceFormat,
    targetFormat: conversion.targetFormat,
    formatColor: conversion.formatColor,
    description: conversion.seo.description,
    heading: conversion.seo.h1,
  }
}

const CONVERSION_SUMMARIES: readonly ConversionSummary[] = getAllConversionTypes().map(toConversionSummary)

const summaryIndex = new Map<string, ConversionSummary>(
  CONVERSION_SUMMARIES.map((conversion) => [conversion.slug, conversion]),
)

export function getConversionSummaryBySlug(slug: string): ConversionSummary | undefined {
  return summaryIndex.get(slug)
}

export function getConversionSummaries(): ConversionSummary[] {
  return [...CONVERSION_SUMMARIES]
}

export function getConversionSummariesByCategory(category: ConversionCategory): ConversionSummary[] {
  return CONVERSION_SUMMARIES.filter((conversion) => conversion.category === category)
}
