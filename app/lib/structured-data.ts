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
