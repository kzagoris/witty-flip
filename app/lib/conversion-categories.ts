import {
  getConversionSummaries,
  toConversionSummary,
  type ConversionSummary,
} from './conversion-summaries'
import {
  getAllConversionTypes,
  type ConversionCategory,
} from './conversions'

export interface ConversionCategoryConfig {
  category: ConversionCategory
  title: string
  shortTitle: string
  navigationTitle: string
  description: string
  homeDescription: string
  hubHref?: '/image-converter'
  hubLabel?: string
}

export interface ConversionCategoryGroup extends ConversionCategoryConfig {
  conversions: ConversionSummary[]
}

export interface QuickConvertSourceGroup {
  sourceFormat: string
  targets: ConversionSummary[]
}

const CATEGORY_ORDER: readonly ConversionCategory[] = ['image', 'developer', 'document', 'ebook']

const CATEGORY_CONFIGS: Record<ConversionCategory, ConversionCategoryConfig> = {
  image: {
    category: 'image',
    title: 'Image conversions',
    shortTitle: 'Images',
    navigationTitle: 'Image tools',
    description: 'Browser-first format swaps for PNG, JPG, WebP, AVIF, and SVG assets.',
    homeDescription:
      'Fast image format conversions with browser-first processing, clearer defaults, and less guesswork.',
    hubHref: '/image-converter',
    hubLabel: 'See all image tools',
  },
  developer: {
    category: 'developer',
    title: 'Developer tools',
    shortTitle: 'Developer',
    navigationTitle: 'Developer tools',
    description: 'Structured data and markup utilities for workflow-friendly content pipelines.',
    homeDescription:
      'Focused tools for markup, structured data, and developer-friendly publishing workflows.',
  },
  document: {
    category: 'document',
    title: 'Document converters',
    shortTitle: 'Documents',
    navigationTitle: 'Document converters',
    description: 'PDF, Office, and document workflows with clear server-side processing rules.',
    homeDescription:
      'Convert office files, PDFs, and authoring formats with reliable server-side workflows.',
  },
  ebook: {
    category: 'ebook',
    title: 'Ebook converters',
    shortTitle: 'Ebooks',
    navigationTitle: 'Ebook converters',
    description: 'Practical ebook conversions built around Kindle-ready and archive-friendly formats.',
    homeDescription:
      'Keep ebook conversions focused on the formats people actually need for reading and sharing.',
  },
}


export function getConversionCategoryConfig(category: ConversionCategory): ConversionCategoryConfig {
  return CATEGORY_CONFIGS[category]
}

export function getDisplayConversionSummaries(): ConversionSummary[] {
  const storedSummaries = getConversionSummaries()
  const summaryBySlug = new Map(
    storedSummaries.map((summary) => [summary.slug, summary] satisfies readonly [string, ConversionSummary]),
  )

  return getAllConversionTypes().map((conversion) => {
    return summaryBySlug.get(conversion.slug) ?? toConversionSummary(conversion)
  })
}

export function getDisplayConversionSummariesByCategory(
  category: ConversionCategory,
): ConversionSummary[] {
  return getDisplayConversionSummaries().filter((conversion) => conversion.category === category)
}

export function groupConversionSummariesByCategory(
  conversions: ConversionSummary[],
): ConversionCategoryGroup[] {
  const grouped = new Map<ConversionCategory, ConversionSummary[]>()

  for (const conversion of conversions) {
    const items = grouped.get(conversion.category)

    if (items) {
      items.push(conversion)
      continue
    }

    grouped.set(conversion.category, [conversion])
  }

  return CATEGORY_ORDER.flatMap((category) => {
    const items = grouped.get(category) ?? []

    if (items.length === 0) {
      return []
    }

    return [
      {
        ...getConversionCategoryConfig(category),
        conversions: items,
      },
    ]
  })
}

export function buildQuickConvertSourceGroups(
  conversions: ConversionSummary[],
): QuickConvertSourceGroup[] {
  const grouped = new Map<string, ConversionSummary[]>()

  for (const conversion of conversions) {
    const sourceFormat = conversion.sourceFormat.toLowerCase()
    const items = grouped.get(sourceFormat)

    if (items) {
      items.push(conversion)
      continue
    }

    grouped.set(sourceFormat, [conversion])
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceFormat, targets]) => ({
      sourceFormat,
      targets: [...targets].sort((left, right) => left.targetFormat.localeCompare(right.targetFormat)),
    }))
}
