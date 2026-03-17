import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowRight,
  Images,
  LockKeyhole,
  MonitorSmartphone,
} from 'lucide-react'
import { FAQSection } from '~/components/conversion/FAQSection'
import { CategoryConversionGrid } from '~/components/hub/CategoryConversionGrid'
import { HubPage } from '~/components/hub/HubPage'
import { QuickConvertSelector } from '~/components/hub/QuickConvertSelector'
import { Button } from '~/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import {
  getDisplayConversionSummariesByCategory,
  getConversionCategoryConfig,
} from '~/lib/conversion-categories'
import { resolveBaseUrl } from '~/lib/base-url'
import type { ConversionFAQ } from '~/lib/conversions'
import { buildFAQPageSchema } from '~/lib/structured-data'

const imageConversions = getDisplayConversionSummariesByCategory('image')
const imageCategory = getConversionCategoryConfig('image')

const imageHubFaqs: ConversionFAQ[] = [
  {
    question: 'Do image conversions upload my file to WittyFlip?',
    answer:
      'The image tools in this rollout are designed to run in your browser when the format is supported there. The individual converter page always tells you whether a format pair stays local or needs a short-lived server step.',
  },
  {
    question: 'Are converted image files stored after I finish?',
    answer:
      'Browser-based results stay on your device. If a workflow ever needs a server-side step, the conversion page spells that out and the file follows WittyFlip’s temporary retention rules.',
  },
  {
    question: 'Why use the hub instead of going straight to a converter?',
    answer:
      'The hub is useful when you know the file formats but not the exact tool name yet. It lets you jump straight to the correct conversion page and compare related image workflows in one place.',
  },
  {
    question: 'Will more image formats be added here?',
    answer:
      'Yes. The hub is built to expand as more image pairs move through QA and copy review, so the page structure stays stable while the catalog grows.',
  },
]



export const Route = createFileRoute('/image-converter')({
  head: () => {
    const baseUrl = resolveBaseUrl()
    const canonicalUrl = `${baseUrl}/image-converter`
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
          name: 'Image Converter',
          item: canonicalUrl,
        },
      ],
    }

    return {
      meta: [
        { title: 'Free Online Image Converter | WittyFlip' },
        {
          name: 'description',
          content:
            'Convert PNG, JPG, WebP, AVIF, and SVG files online. Browser-first image tools with clear privacy notes and direct links to each format pair.',
        },
        { property: 'og:title', content: 'Free Online Image Converter | WittyFlip' },
        {
          property: 'og:description',
          content:
            'Convert PNG, JPG, WebP, AVIF, and SVG files online. Browser-first image tools with clear privacy notes and direct links to each format pair.',
        },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: canonicalUrl },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: 'Free Online Image Converter | WittyFlip' },
        {
          name: 'twitter:description',
          content:
            'Browser-first image conversions for PNG, JPG, WebP, AVIF, and SVG with clearer privacy guidance.',
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
          children: JSON.stringify(buildFAQPageSchema(imageHubFaqs)),
        },
      ],
    }
  },
  component: ImageConverterPage,
})

function ImageConverterPage() {
  return (
    <HubPage
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Image Converter' },
      ]}
      eyebrow={imageCategory.navigationTitle}
      title="Free Online Image Converter"
      description="Switch between common image formats without digging through a giant directory. Start from the hub, then jump into the exact PNG, JPG, WebP, AVIF, or SVG converter you need."
      highlights={[
        'Browser-first workflows',
        'Clear privacy notes',
        'Focused image catalog',
      ]}
      quickConvert={
        <QuickConvertSelector
          conversions={imageConversions}
          emptyStateMessage="This local checkout does not yet include the image conversion entries owned by the catalog rollout, but the hub and navigation are ready for them."
        />
      }
    >
      <CategoryConversionGrid
        conversions={imageConversions}
        description="Browse the image format pairs that WittyFlip supports in this cluster. Each page explains the processing mode and any quality options before you convert."
        emptyStateDescription="The hub is live, but this working tree does not currently include the image conversion entries from the protected catalog files."
        emptyStateTitle="Image tools are being staged"
        title="Image conversion tools"
      />

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card className="rounded-[1.75rem] border shadow-sm">
          <CardHeader>
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-fuchsia-100 text-fuchsia-700">
              <Images className="h-5 w-5" />
            </div>
            <CardTitle className="font-heading text-2xl">Why start from the image hub?</CardTitle>
            <CardDescription>
              Image workflows tend to branch quickly once you compare compression, compatibility, and
              transparency requirements.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              Use the hub when you know the source and target formats but want a quicker path than
              scanning the whole site.
            </p>
            <ul className="space-y-2">
              <li>• jump directly to the exact format pair from the quick convert selector</li>
              <li>• compare related PNG, JPG, WebP, AVIF, and SVG tools in one place</li>
              <li>• keep privacy notes and processing expectations consistent across the cluster</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border shadow-sm">
          <CardHeader>
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <CardTitle className="font-heading text-2xl">Privacy and processing</CardTitle>
            <CardDescription>
              WittyFlip surfaces the processing model before you start so you know what stays local.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
            <div className="rounded-2xl border bg-neutral-50 p-4">
              <div className="flex items-center gap-3 font-medium text-neutral-900">
                <MonitorSmartphone className="h-4 w-4 text-primary" />
                Browser-first image workflows
              </div>
              <p className="mt-2">
                Many image tools in this phase are designed to run in your browser so files can stay
                on your device throughout conversion.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link to="/privacy">Read privacy details</Link>
              </Button>
              <Button asChild className="gap-2">
                <Link to="/">
                  Explore all categories
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <FAQSection faqs={imageHubFaqs} />
    </HubPage>
  )
}
