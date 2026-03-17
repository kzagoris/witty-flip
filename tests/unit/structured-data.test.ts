import { describe, expect, it } from 'vitest'
import type { ClientConversionType } from '~/lib/conversions'
import { getConversionBySlug } from '~/lib/conversions'
import { buildBreadcrumbSchema } from '~/lib/structured-data'

describe('buildBreadcrumbSchema', () => {
  it('uses the image hub breadcrumb for image conversions', () => {
    const conversion: ClientConversionType = {
      slug: 'png-to-jpg',
      category: 'image',
      processingMode: 'client',
      clientConverter: 'canvas',
      sourceFormat: 'png',
      targetFormat: 'jpg',
      sourceExtensions: ['.png'],
      sourceMimeTypes: ['image/png'],
      targetExtension: '.jpg',
      targetMimeType: 'image/jpeg',
      formatColor: '#2563eb',
      seo: {
        title: 'PNG to JPG',
        description: 'Convert PNG to JPG',
        h1: 'PNG to JPG',
        keywords: ['png to jpg'],
      },
      seoContent: '<p>Test</p>',
      faq: [],
      relatedConversions: [],
    }

    expect(buildBreadcrumbSchema(conversion)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: 'https://wittyflip.com/',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Image Converter',
          item: 'https://wittyflip.com/image-converter',
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: 'PNG to JPG',
          item: 'https://wittyflip.com/png-to-jpg',
        },
      ],
    })
  })

  it('keeps server-side conversions on the direct breadcrumb path', () => {
    const conversion = getConversionBySlug('docx-to-markdown')

    expect(conversion).toBeDefined()
    expect(buildBreadcrumbSchema(conversion!)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: 'https://wittyflip.com/',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'DOCX to MARKDOWN',
          item: 'https://wittyflip.com/docx-to-markdown',
        },
      ],
    })
  })
})
