import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowRight,
  Cookie,
  CreditCard,
  LockKeyhole,
  MonitorSmartphone,
  Server,
  Trash2,
} from 'lucide-react'
import { FAQSection } from '~/components/conversion/FAQSection'
import { PageShell } from '~/components/layout/PageShell'
import { Button } from '~/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { resolveBaseUrl } from '~/lib/base-url'
import type { ConversionFAQ } from '~/lib/conversions'
import { buildFAQPageSchema } from '~/lib/structured-data'

const privacyFaqs: ConversionFAQ[] = [
  {
    question: 'How do I know whether a conversion stays on my device?',
    answer:
      'Each conversion page shows whether the workflow runs in your browser or on WittyFlip’s servers. Browser-based tools keep the file local to your device during conversion.',
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
    <PageShell>
      <section className="relative overflow-hidden rounded-[2rem] border bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-12 text-white shadow-sm sm:px-8 sm:py-14">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(56,189,248,0.18)_0%,_transparent_45%)]" />

        <div className="relative z-10 max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-200">
            Trust & privacy
          </p>
          <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight sm:text-5xl">
            How WittyFlip handles your files
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-200">
            Some conversions run entirely in your browser. Others use WittyFlip’s servers and follow
            temporary retention rules. This page explains what happens, what we keep, and what we do
            not do behind the scenes.
          </p>

          <div className="mt-6 flex flex-wrap gap-2 text-sm text-slate-100">
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">
              browser-first when possible
            </span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">
              auto-deleted server jobs
            </span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">
              Stripe handles card entry
            </span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">
              no ad trackers on the conversion flow
            </span>
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card className="rounded-[1.75rem] border shadow-sm">
          <CardHeader>
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <MonitorSmartphone className="h-5 w-5" />
            </div>
            <CardTitle className="font-heading text-2xl">Client-side processing</CardTitle>
            <CardDescription>
              Browser-based converters keep the work local whenever the browser can safely handle the
              format pair.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>Your file stays on this device during the conversion itself.</p>
            <p>
              The generated result also stays local unless you choose a later action that needs a
              server-side payment or status step.
            </p>
            <p>
              For active client-side conversion attempts, WittyFlip may set a signed recovery cookie
              so the browser can reconnect to that attempt after a refresh. It is not used for
              advertising or cross-site tracking.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border shadow-sm">
          <CardHeader>
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
              <Server className="h-5 w-5" />
            </div>
            <CardTitle className="font-heading text-2xl">Server-side processing</CardTitle>
            <CardDescription>
              Some conversions need backend tools and run on WittyFlip’s servers instead of in the
              browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              When a page uses server-side processing, you upload the file to WittyFlip so the
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
          </CardContent>
        </Card>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card className="rounded-[1.75rem] border shadow-sm">
          <CardHeader>
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
              <Trash2 className="h-5 w-5" />
            </div>
            <CardTitle className="font-heading text-2xl">Retention and deletion</CardTitle>
            <CardDescription>
              WittyFlip keeps temporary server-side data only as long as the workflow needs it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
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
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border shadow-sm">
          <CardHeader>
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <CreditCard className="h-5 w-5" />
            </div>
            <CardTitle className="font-heading text-2xl">Payments and billing</CardTitle>
            <CardDescription>
              Stripe handles payment collection. WittyFlip stores only the minimum checkout data
              needed to unlock a conversion.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              WittyFlip does not receive or store raw card numbers, CVC values, or full payment
              method details.
            </p>
            <p>
              We do keep Stripe session identifiers, payment status, amount, and the conversion
              reference needed to resume or reconcile the workflow.
            </p>
            <p>
              This lets WittyFlip recover from missed webhooks or expired checkout sessions without
              asking you to start over.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="mt-10 rounded-[1.75rem] border bg-white p-6 shadow-sm sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
          <div>
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <h2 className="mt-4 font-heading text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
              No ad tracking, limited operational data
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
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

          <div className="rounded-[1.5rem] border bg-neutral-50 p-5">
            <div className="flex items-center gap-3 text-sm font-medium text-neutral-900">
              <Cookie className="h-4 w-4 text-primary" />
              Helpful next steps
            </div>

            <div className="mt-4 space-y-3">
              <Button asChild className="w-full justify-between">
                <Link to="/image-converter">
                  Browse the image hub
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>

              <Button asChild className="w-full justify-between" variant="outline">
                <Link to="/">
                  Go back to the homepage
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>

              <Button asChild className="w-full justify-between" variant="outline">
                <Link to="/blog">
                  Read the blog
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <FAQSection faqs={privacyFaqs} />
    </PageShell>
  )
}
