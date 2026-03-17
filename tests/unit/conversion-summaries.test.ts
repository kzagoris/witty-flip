import { describe, expect, it } from 'vitest'
import {
  getConversionSummaryBySlug,
  getConversionSummaries,
  getConversionSummariesByCategory,
} from '~/lib/conversion-summaries'
import { getAllConversionTypes } from '~/lib/conversions'

describe('conversion summaries', () => {
  it('includes the category for every summary', () => {
    const summaries = getConversionSummaries()
    const conversions = getAllConversionTypes()

    expect(summaries).toHaveLength(conversions.length)

    for (const summary of summaries) {
      const matchingConversion = conversions.find((conversion) => conversion.slug === summary.slug)

      expect(summary.category, `${summary.slug}: category`).toBeTruthy()
      expect(matchingConversion?.category).toBe(summary.category)
      expect(summary.heading).toBe(matchingConversion?.seo.h1)
      expect(summary.description).toBe(matchingConversion?.seo.description)
    }
  })

  it('filters summaries by category', () => {
    expect(getConversionSummariesByCategory('document')).toHaveLength(6)
    expect(getConversionSummariesByCategory('ebook')).toHaveLength(1)
    expect(getConversionSummariesByCategory('image')).toHaveLength(9)
    expect(getConversionSummariesByCategory('developer')).toEqual([])
  })

  it('returns the expected summary by slug', () => {
    expect(getConversionSummaryBySlug('png-to-jpg')).toMatchObject({
      slug: 'png-to-jpg',
      category: 'image',
      sourceFormat: 'png',
      targetFormat: 'jpg',
    })

    expect(getConversionSummaryBySlug('epub-to-mobi')).toMatchObject({
      slug: 'epub-to-mobi',
      category: 'ebook',
      sourceFormat: 'epub',
      targetFormat: 'mobi',
    })
  })
})
