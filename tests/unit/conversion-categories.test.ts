import { describe, expect, it } from 'vitest'
import {
  buildQuickConvertSourceGroups,
  getConversionCategoryConfig,
  getDisplayConversionSummaries,
  groupConversionSummariesByCategory,
} from '~/lib/conversion-categories'
import type { ConversionSummary } from '~/lib/conversion-summaries'
import { getAllConversionTypes } from '~/lib/conversions'

const mockedSummaries: ConversionSummary[] = [
  {
    slug: 'docx-to-markdown',
    category: 'document',
    sourceFormat: 'docx',
    targetFormat: 'markdown',
    formatColor: '#2563eb',
    description: 'Convert DOCX to Markdown.',
    heading: 'Convert DOCX to Markdown',
  },
  {
    slug: 'png-to-jpg',
    category: 'image',
    sourceFormat: 'png',
    targetFormat: 'jpg',
    formatColor: '#9333ea',
    description: 'Convert PNG to JPG.',
    heading: 'Convert PNG to JPG',
  },
  {
    slug: 'json-to-yaml',
    category: 'developer',
    sourceFormat: 'json',
    targetFormat: 'yaml',
    formatColor: '#f59e0b',
    description: 'Convert JSON to YAML.',
    heading: 'Convert JSON to YAML',
  },
  {
    slug: 'epub-to-mobi',
    category: 'ebook',
    sourceFormat: 'epub',
    targetFormat: 'mobi',
    formatColor: '#10b981',
    description: 'Convert EPUB to MOBI.',
    heading: 'Convert EPUB to MOBI',
  },
  {
    slug: 'png-to-webp',
    category: 'image',
    sourceFormat: 'png',
    targetFormat: 'webp',
    formatColor: '#7c3aed',
    description: 'Convert PNG to WebP.',
    heading: 'Convert PNG to WebP',
  },
]

describe('conversion categories', () => {
  it('returns category groups in rollout order with hub metadata', () => {
    const groups = groupConversionSummariesByCategory(mockedSummaries)

    expect(groups.map((group) => group.category)).toEqual([
      'image',
      'developer',
      'document',
      'ebook',
    ])

    expect(groups[0]).toMatchObject({
      title: 'Image conversions',
      shortTitle: 'Images',
      hubHref: '/image-converter',
      hubLabel: 'See all image tools',
    })
  })

  it('builds quick convert source groups in alphabetical order', () => {
    const sourceGroups = buildQuickConvertSourceGroups(mockedSummaries)

    expect(sourceGroups.map((group) => group.sourceFormat)).toEqual([
      'docx',
      'epub',
      'json',
      'png',
    ])
    expect(sourceGroups[3].targets.map((target) => target.targetFormat)).toEqual(['jpg', 'webp'])
  })

  it('exposes category copy and builds a display summary list for every conversion', () => {
    expect(getConversionCategoryConfig('document')).toMatchObject({
      title: 'Document converters',
      shortTitle: 'Documents',
    })

    const displaySummaries = getDisplayConversionSummaries()
    const conversions = getAllConversionTypes()

    expect(displaySummaries).toHaveLength(conversions.length)
    expect(new Set(displaySummaries.map((summary) => summary.slug)).size).toBe(conversions.length)
  })
})
