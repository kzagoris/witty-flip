import type { ConversionFAQ, ConversionType } from './conversions'

export function buildFAQPageSchema(faqs: ConversionFAQ[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  }
}

export function buildSoftwareAppSchema(conversion: ConversionType) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: `WittyFlip ${conversion.sourceFormat.toUpperCase()} to ${conversion.targetFormat.toUpperCase()} Converter`,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: '2 free conversions per day, then $0.49 per file',
    },
  }
}

export function buildBreadcrumbSchema(
  conversion: ConversionType,
): {
  '@context': 'https://schema.org'
  '@type': 'BreadcrumbList'
  itemListElement: Array<{
    '@type': 'ListItem'
    position: number
    name: string
    item: string
  }>
} {
  const configuredBaseUrl = process.env.BASE_URL?.trim()
  const baseUrl = configuredBaseUrl && configuredBaseUrl !== '/'
    ? configuredBaseUrl.replace(/\/$/, '')
    : 'https://wittyflip.com'
  const baseItems = [
    { name: 'Home', item: `${baseUrl}/` },
  ]

  const categoryItem = conversion.category === 'image'
    ? { name: 'Image Converter', item: `${baseUrl}/image-converter` }
    : null

  const items = [
    ...baseItems,
    ...(categoryItem ? [categoryItem] : []),
    {
      name: `${conversion.sourceFormat.toUpperCase()} to ${conversion.targetFormat.toUpperCase()}`,
      item: `${baseUrl}/${conversion.slug}`,
    },
  ]

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.item,
    })),
  }
}
