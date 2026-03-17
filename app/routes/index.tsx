import { createFileRoute } from '@tanstack/react-router'
import { PageShell } from '~/components/layout/PageShell'
import { CategorizedConversionGrid } from '~/components/home/CategorizedConversionGrid'
import { HeroSection } from '~/components/home/HeroSection'
import { getDisplayConversionSummaries } from '~/lib/conversion-categories'

const summaries = getDisplayConversionSummaries()

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Convert Files Without the Guesswork | WittyFlip' },
      {
        name: 'description',
        content:
          'Convert images, documents, ebooks, and more without the guesswork. Many WittyFlip tools run in your browser, and server-side jobs are auto-deleted after download.',
      },
      { property: 'og:title', content: 'Convert Files Without the Guesswork | WittyFlip' },
      {
        property: 'og:description',
        content:
          'Convert images, documents, ebooks, and more without the guesswork. Many WittyFlip tools run in your browser, and server-side jobs are auto-deleted after download.',
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
      <section className='mt-12'>
        <CategorizedConversionGrid conversions={summaries} />
      </section>
    </PageShell>
  )
}
