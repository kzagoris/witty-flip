import { describe, it, expect } from 'vitest'
import {
  getConversionBySlug,
  getClientConversions,
  isValidConversionType,
  getAllConversionTypes,
  getConversionsByCategory,
  getIndexableConversions,
  getServerConversions,
} from '~/lib/conversions'

const SERVER_SLUGS = [
  'docx-to-markdown',
  'markdown-to-pdf',
  'html-to-pdf',
  'djvu-to-pdf',
  'epub-to-mobi',
  'odt-to-docx',
  'latex-to-pdf',
] as const

const CLIENT_IMAGE_SLUGS = [
  'webp-to-png',
  'webp-to-jpg',
  'png-to-webp',
  'avif-to-jpg',
  'svg-to-png',
  'png-to-jpg',
  'jpg-to-png',
  'jpg-to-webp',
  'avif-to-png',
] as const

const WEBP_ENHANCED_SLUGS = [
  'webp-to-png',
  'webp-to-jpg',
  'png-to-webp',
  'jpg-to-webp',
] as const

const KNOWN_SLUGS = [...SERVER_SLUGS, ...CLIENT_IMAGE_SLUGS] as const

describe('getConversionBySlug', () => {
  it('returns the expected definition for a valid slug', () => {
    const result = getConversionBySlug('docx-to-markdown')
    expect(result).toBeDefined()
    expect(result!.slug).toBe('docx-to-markdown')
    expect(result!.category).toBe('document')
    expect(result!.processingMode).toBe('server')
    expect(result!.sourceFormat).toBe('docx')
    expect(result!.targetFormat).toBe('markdown')
    if (result!.processingMode !== 'server') {
      throw new Error('Expected docx-to-markdown to remain a server conversion')
    }
    expect(result!.toolName).toBe('pandoc')
  })

  it('returns the correct definition for every known slug', () => {
    for (const slug of KNOWN_SLUGS) {
      const result = getConversionBySlug(slug)
      expect(result, `slug "${slug}" should be found`).toBeDefined()
      expect(result!.slug).toBe(slug)
    }
  })

  it('returns undefined for an unknown slug', () => {
    expect(getConversionBySlug('pdf-to-docx')).toBeUndefined()
    expect(getConversionBySlug('')).toBeUndefined()
    expect(getConversionBySlug('nonexistent')).toBeUndefined()
  })
})

describe('isValidConversionType', () => {
  it.each(KNOWN_SLUGS)('returns true for known slug "%s"', (slug) => {
    expect(isValidConversionType(slug)).toBe(true)
  })

  it('returns false for invalid slugs', () => {
    expect(isValidConversionType('pdf-to-docx')).toBe(false)
    expect(isValidConversionType('')).toBe(false)
    expect(isValidConversionType('DOCX-TO-MARKDOWN')).toBe(false)
    expect(isValidConversionType('docx_to_markdown')).toBe(false)
    expect(isValidConversionType('docx-to-pdf')).toBe(false)
  })
})

describe('getAllConversionTypes', () => {
  it('returns the 7 server conversions plus 9 image conversions', () => {
    expect(getAllConversionTypes()).toHaveLength(16)
  })

  it('does not expose the canonical array by reference', () => {
    const first = getAllConversionTypes()
    const second = getAllConversionTypes()
    expect(first).not.toBe(second)
    first.pop()
    expect(getAllConversionTypes()).toHaveLength(16)
  })

  it('every conversion has source/target metadata', () => {
    for (const ct of getAllConversionTypes()) {
      expect(ct.slug, `${ct.slug}: slug`).toBeTruthy()
      expect(ct.category, `${ct.slug}: category`).toBeTruthy()
      expect(ct.processingMode, `${ct.slug}: processingMode`).toBeTruthy()
      expect(ct.sourceFormat, `${ct.slug}: sourceFormat`).toBeTruthy()
      expect(ct.targetFormat, `${ct.slug}: targetFormat`).toBeTruthy()
      expect(ct.sourceExtensions.length, `${ct.slug}: sourceExtensions`).toBeGreaterThan(0)
      expect(ct.sourceMimeTypes.length, `${ct.slug}: sourceMimeTypes`).toBeGreaterThan(0)
      expect(ct.targetExtension, `${ct.slug}: targetExtension`).toBeTruthy()
      expect(ct.targetMimeType, `${ct.slug}: targetMimeType`).toBeTruthy()
      if (ct.processingMode === 'server') {
        expect(ct.toolName, `${ct.slug}: toolName`).toBeTruthy()
      } else {
        expect(ct.clientConverter, `${ct.slug}: clientConverter`).toBeTruthy()
        expect(ct.toolName, `${ct.slug}: toolName`).toBeUndefined()
      }
    }
  })

  it('every conversion has SEO fields', () => {
    for (const ct of getAllConversionTypes()) {
      expect(ct.seo.title, `${ct.slug}: seo.title`).toBeTruthy()
      expect(ct.seo.description, `${ct.slug}: seo.description`).toBeTruthy()
      expect(ct.seo.h1, `${ct.slug}: seo.h1`).toBeTruthy()
      expect(ct.seo.keywords.length, `${ct.slug}: seo.keywords`).toBeGreaterThan(0)
      expect(ct.seoContent, `${ct.slug}: seoContent`).toBeTruthy()
    }
  })

  it('every conversion has at least one FAQ entry with question and answer', () => {
    for (const ct of getAllConversionTypes()) {
      expect(ct.faq.length, `${ct.slug}: faq`).toBeGreaterThan(0)
      for (const item of ct.faq) {
        expect(item.question, `${ct.slug}: faq question`).toBeTruthy()
        expect(item.answer, `${ct.slug}: faq answer`).toBeTruthy()
      }
    }
  })

  it('every conversion has at least one related conversion', () => {
    for (const ct of getAllConversionTypes()) {
      expect(ct.relatedConversions.length, `${ct.slug}: relatedConversions`).toBeGreaterThan(0)
    }
  })

  it('html-to-pdf copy does not claim unimplemented network isolation or SSRF guarantees', () => {
    const htmlToPdf = getConversionBySlug('html-to-pdf')
    expect(htmlToPdf).toBeDefined()

    const copy = [
      htmlToPdf!.seoContent,
      ...htmlToPdf!.faq.map((item) => `${item.question} ${item.answer}`),
    ].join(' ').toLowerCase()

    expect(copy).not.toContain('ssrf')
    expect(copy).not.toContain('no network access')
    expect(copy).not.toContain('external stylesheets referenced by url are not loaded')
    expect(copy).not.toContain('external resource loading')
  })

  it('every conversion tool name is a non-empty string', () => {
    const tools = getServerConversions().map((ct) => ct.toolName)
    for (const tool of tools) {
      expect(typeof tool).toBe('string')
      expect(tool.length).toBeGreaterThan(0)
    }
  })

  it('returns only server conversions from getServerConversions', () => {
    const serverConversions = getServerConversions()

    expect(serverConversions).toHaveLength(7)
    expect(serverConversions.every((conversion) => conversion.processingMode === 'server')).toBe(true)
    expect(serverConversions.every((conversion) => typeof conversion.toolName === 'string' && conversion.toolName.length > 0)).toBe(true)
  })

  it('returns the 9 client-side image conversions from getClientConversions', () => {
    const clientConversions = getClientConversions()

    expect(clientConversions).toHaveLength(9)
    expect(clientConversions.every((conversion) => conversion.processingMode === 'client')).toBe(true)
    expect(clientConversions.every((conversion) => conversion.category === 'image')).toBe(true)
    expect(clientConversions.every((conversion) => conversion.clientConverter === 'canvas')).toBe(true)
    expect(clientConversions.every((conversion) => conversion.toolName === undefined)).toBe(true)
  })

  it('groups conversions by category', () => {
    expect(getConversionsByCategory('document')).toHaveLength(6)
    expect(getConversionsByCategory('ebook')).toHaveLength(1)
    expect(getConversionsByCategory('image')).toHaveLength(9)
    expect(getConversionsByCategory('developer')).toHaveLength(0)
  })

  it('keeps only the 7 server conversions indexable for sitemap and SEO', () => {
    expect(getIndexableConversions()).toHaveLength(7)
    expect(getIndexableConversions().every((conversion) => conversion.processingMode === 'server')).toBe(true)
  })

  it('marks every new image conversion as client-side and noindex', () => {
    for (const slug of CLIENT_IMAGE_SLUGS) {
      const conversion = getConversionBySlug(slug)

      expect(conversion, `${slug}: conversion`).toBeDefined()
      expect(conversion!.category, `${slug}: category`).toBe('image')
      expect(conversion!.processingMode, `${slug}: processingMode`).toBe('client')
      expect(conversion!.indexable, `${slug}: indexable`).toBe(false)
      if (conversion!.processingMode !== 'client') {
        throw new Error(`Expected ${slug} to be a client conversion`)
      }
      expect(conversion!.clientConverter, `${slug}: clientConverter`).toBe('canvas')
    }
  })

  it('adds enhanced WebP conversion support to the four WebP-sensitive entries', () => {
    for (const slug of WEBP_ENHANCED_SLUGS) {
      const conversion = getConversionBySlug(slug)

      expect(conversion, `${slug}: conversion`).toBeDefined()
      if (conversion!.processingMode !== 'client') {
        throw new Error(`Expected ${slug} to be a client conversion`)
      }
      expect(conversion!.clientConverterEnhanced, `${slug}: clientConverterEnhanced`).toBe('webp-wasm')
    }
  })
})
