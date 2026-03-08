import { describe, it, expect } from 'vitest'
import {
  getConversionBySlug,
  isValidConversionType,
  getAllConversionTypes,
} from '~/lib/conversions'

const KNOWN_SLUGS = [
  'docx-to-markdown',
  'markdown-to-pdf',
  'html-to-pdf',
  'djvu-to-pdf',
  'epub-to-mobi',
  'odt-to-docx',
  'latex-to-pdf',
] as const

describe('getConversionBySlug', () => {
  it('returns the expected definition for a valid slug', () => {
    const result = getConversionBySlug('docx-to-markdown')
    expect(result).toBeDefined()
    expect(result!.slug).toBe('docx-to-markdown')
    expect(result!.sourceFormat).toBe('docx')
    expect(result!.targetFormat).toBe('markdown')
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
  it('returns exactly 7 items', () => {
    expect(getAllConversionTypes()).toHaveLength(7)
  })

  it('does not expose the canonical array by reference', () => {
    const first = getAllConversionTypes()
    const second = getAllConversionTypes()
    expect(first).not.toBe(second)
    first.pop()
    expect(getAllConversionTypes()).toHaveLength(7)
  })

  it('every conversion has source/target metadata', () => {
    for (const ct of getAllConversionTypes()) {
      expect(ct.slug, `${ct.slug}: slug`).toBeTruthy()
      expect(ct.sourceFormat, `${ct.slug}: sourceFormat`).toBeTruthy()
      expect(ct.targetFormat, `${ct.slug}: targetFormat`).toBeTruthy()
      expect(ct.sourceExtensions.length, `${ct.slug}: sourceExtensions`).toBeGreaterThan(0)
      expect(ct.sourceMimeTypes.length, `${ct.slug}: sourceMimeTypes`).toBeGreaterThan(0)
      expect(ct.targetExtension, `${ct.slug}: targetExtension`).toBeTruthy()
      expect(ct.targetMimeType, `${ct.slug}: targetMimeType`).toBeTruthy()
      expect(ct.toolName, `${ct.slug}: toolName`).toBeTruthy()
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

  it('every conversion tool name is a non-empty string', () => {
    const tools = getAllConversionTypes().map((ct) => ct.toolName)
    for (const tool of tools) {
      expect(typeof tool).toBe('string')
      expect(tool.length).toBeGreaterThan(0)
    }
  })
})
