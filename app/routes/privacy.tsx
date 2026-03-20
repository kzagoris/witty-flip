import { createFileRoute } from '@tanstack/react-router'
import { FAQSection } from '~/components/conversion/FAQSection'
import { PageShell } from '~/components/layout/PageShell'
import { resolveBaseUrl } from '~/lib/base-url'
import type { ConversionFAQ } from '~/lib/conversions'
import { buildFAQPageSchema } from '~/lib/structured-data'

const privacyFaqs: ConversionFAQ[] = [
  {
    question: 'How do I know whether a conversion stays on my device?',
    answer:
      'Each conversion page shows whether the workflow runs in your browser or on WittyFlip\u2019s servers. Browser-based tools keep the file local to your device during conversion.',
  },
  {
    question: 'How long are server-side files kept?',
    answer:
      'Server-side uploads and outputs are temporary. Converted files are available during the download window and are automatically deleted afterward.',
  },
  {
    question: 'Does WittyFlip store my payment details?',
    answer:
      'No. Stripe handles card entry and payment processing. WittyFlip stores the checkout and payment status data needed to unlock or reconcile a conversion, but not raw card numbers.',
  },
  {
    question: 'Do you use advertising or cross-site tracking cookies?',
    answer:
      'WittyFlip does not use ad trackers or retargeting pixels on the conversion flow. The only cookie currently used in this rollout is a signed recovery cookie for active client-side conversion attempts.',
  },
]

export const Route = createFileRoute('/privacy')({
  head: () => {
    const baseUrl = resolveBaseUrl()
    const canonicalUrl = `${baseUrl}/privacy`
    const breadcrumbSchema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: `${baseUrl}/`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Privacy',
          item: canonicalUrl,
        },
      ],
    }

    return {
      meta: [
        { title: 'Privacy & Processing | WittyFlip' },
        {
          name: 'description',
          content:
            'See how WittyFlip handles browser-based versus server-side conversions, temporary retention, payments, and no-ad-tracking defaults.',
        },
        { property: 'og:title', content: 'Privacy & Processing | WittyFlip' },
        {
          property: 'og:description',
          content:
            'See how WittyFlip handles browser-based versus server-side conversions, temporary retention, payments, and no-ad-tracking defaults.',
        },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: canonicalUrl },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: 'Privacy & Processing | WittyFlip' },
        {
          name: 'twitter:description',
          content:
            'Client-side versus server-side processing, retention windows, payment handling, and tracking defaults explained clearly.',
        },
      ],
      links: [{ rel: 'canonical', href: canonicalUrl }],
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify(breadcrumbSchema),
        },
        {
          type: 'application/ld+json',
          children: JSON.stringify(buildFAQPageSchema(privacyFaqs)),
        },
      ],
    }
  },
  component: PrivacyPage,
})

function PrivacyPage() {
  return (
    <PageShell variant="narrow">
      <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
        How WittyFlip handles your files
      </h1>
      <p className="mt-4 text-lg leading-8 text-muted-foreground">
        Some conversions run entirely in your browser. Others use WittyFlip's servers and follow
        temporary retention rules. This page explains what happens, what we keep, and what we do
        not do behind the scenes.
      </p>

      <section className="mt-12 space-y-10">
        <div>
          <h2 className="font-heading text-2xl font-semibold">Client-side processing</h2>
          <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              Browser-based converters keep the work local whenever the browser can safely handle the
              format pair. Your file stays on this device during the conversion itself.
            </p>
            <p>
              The generated result also stays local unless you choose a later action that needs a
              server-side payment or status step.
            </p>
            <p>
              For active client-side conversion attempts, WittyFlip may set a signed recovery cookie
              so the browser can reconnect to that attempt after a refresh. It is not used for
              advertising or cross-site tracking.
            </p>
          </div>
        </div>

        <div>
          <h2 className="font-heading text-2xl font-semibold">Server-side processing</h2>
          <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              Some conversions need backend tools and run on WittyFlip's servers instead of in the
              browser. When a page uses server-side processing, you upload the file to WittyFlip so the
              converter can run there.
            </p>
            <p>
              Those workflows are temporary by design: files are stored only for the conversion,
              download window, and cleanup process.
            </p>
            <p>
              WittyFlip uses this mode when the required conversion tools cannot realistically run in
              the browser yet.
            </p>
          </div>
        </div>

        <div>
          <h2 className="font-heading text-2xl font-semibold">Retention and deletion</h2>
          <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              Completed server-side conversions are available for download during the retention
              window, then automatically deleted.
            </p>
            <p>
              Cleanup jobs also expire stale payment-required attempts and other temporary artifacts
              so abandoned uploads do not sit around indefinitely.
            </p>
            <p>
              Browser-only conversions do not create a server-side output file because the result is
              produced locally in the tab.
            </p>
          </div>
        </div>

        <div>
          <h2 className="font-heading text-2xl font-semibold">Payments and billing</h2>
          <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              Stripe handles payment collection. WittyFlip stores only the minimum checkout data
              needed to unlock a conversion.
            </p>
            <p>
              WittyFlip does not receive or store raw card numbers, CVC values, or full payment
              method details.
            </p>
            <p>
              We do keep Stripe session identifiers, payment status, amount, and the conversion
              reference needed to resume or reconcile the workflow.
            </p>
          </div>
        </div>

        <div>
          <h2 className="font-heading text-2xl font-semibold">No ad tracking, limited operational data</h2>
          <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              WittyFlip does not use ad trackers or retargeting pixels across the conversion flow.
            </p>
            <p>
              We do keep the operational data needed to run the product responsibly, including
              request logs, IP-based rate-limit records, and short-lived conversion state.
            </p>
            <p>
              The signed recovery cookie used for active client-side attempts is only there to
              reconnect the same browser to the same attempt. It is not an advertising identifier.
            </p>
            <p>
              Your files are not used for model training, and WittyFlip is intentionally designed
              without account creation for basic conversions.
            </p>
          </div>
        </div>
      </section>

      <FAQSection faqs={privacyFaqs} />
    </PageShell>
  )
}
