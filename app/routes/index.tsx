import { createFileRoute } from '@tanstack/react-router'
import { PageShell } from '~/components/layout/PageShell'
import { HeroSection } from '~/components/home/HeroSection'
import { ConversionGrid } from '~/components/home/ConversionGrid'
import { getConversionSummaries } from '~/lib/conversion-summaries'

const summaries = getConversionSummaries()

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'WittyFlip - Free Online File Converter' },
      {
        name: 'description',
        content:
          'Convert documents online for free. DOCX to Markdown, DJVU to PDF, EPUB to MOBI, and more. No signup needed.',
      },
      { property: 'og:title', content: 'WittyFlip - Free Online File Converter' },
      {
        property: 'og:description',
        content:
          'Convert documents online for free. DOCX to Markdown, DJVU to PDF, EPUB to MOBI, and more.',
      },
      { property: 'og:type', content: 'website' },
    ],
  }),
  component: HomePage,
})

function HomePage() {
  return (
    <PageShell>
      <HeroSection />
      <section className="mt-10">
        <h2 className="mb-6 font-heading text-2xl font-bold text-neutral-900">
          Choose a Conversion
        </h2>
        <ConversionGrid conversions={summaries} />
      </section>
    </PageShell>
  )
}
