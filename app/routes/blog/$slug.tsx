import { createFileRoute, notFound } from "@tanstack/react-router"
import { PageShell } from "~/components/layout/PageShell"
import { BlogPostHeader } from "~/components/blog/BlogPostHeader"
import { BlogCTABanner } from "~/components/blog/BlogCTABanner"
import { BlogBottomCTA } from "~/components/blog/BlogBottomCTA"
import { getConversionBySlug } from "~/lib/conversions"
import { callServerFn } from "~/lib/api-client"
import { getBlogPostBySlug } from "~/server/api/blog"
import type { BlogPost } from "~/lib/blog"

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const result = await callServerFn<BlogPost | null>(getBlogPostBySlug, { slug: params.slug })

    if (!result.ok || !result.data) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw notFound()
    }

    const post = result.data
    const relatedConversion = getConversionBySlug(post.relatedConversion)
    const baseUrl = typeof window === "undefined"
      ? (process.env.BASE_URL ?? "https://wittyflip.com").replace(/\/$/, "")
      : window.location.origin

    return { post, relatedConversion, baseUrl }
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const { post, baseUrl } = loaderData
    const canonicalUrl = `${baseUrl}/blog/${post.slug}`
    const imageUrl = post.ogImage
      ? `${baseUrl}${post.ogImage}`
      : `${baseUrl}/og-default.png`

    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.description,
      datePublished: post.date,
      image: imageUrl,
      mainEntityOfPage: canonicalUrl,
      publisher: { "@type": "Organization", name: "WittyFlip" },
    }

    return {
      meta: [
        { title: `${post.title} | WittyFlip Blog` },
        { name: "description", content: post.description },
        { property: "og:title", content: post.title },
        { property: "og:description", content: post.description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: canonicalUrl },
        { property: "og:image", content: imageUrl },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: post.title },
        { name: "twitter:description", content: post.description },
        { name: "twitter:image", content: imageUrl },
        { property: "article:published_time", content: post.date },
      ],
      links: [{ rel: "canonical", href: canonicalUrl }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(articleSchema),
        },
      ],
    }
  },
  notFoundComponent: () => (
    <PageShell>
      <div className="py-16 text-center">
        <h1 className="font-heading text-3xl font-bold">Post Not Found</h1>
        <p className="mt-2 text-muted-foreground">The blog post you are looking for does not exist.</p>
      </div>
    </PageShell>
  ),
  component: BlogPostPage,
})

function BlogPostPage() {
  const { post, relatedConversion } = Route.useLoaderData()

  const conversionName = relatedConversion
    ? `${relatedConversion.sourceFormat.toUpperCase()} to ${relatedConversion.targetFormat.toUpperCase()}`
    : ""
  const formatColor = relatedConversion?.formatColor ?? "#6366f1"

  return (
    <PageShell>
      <BlogPostHeader
        title={post.title}
        description={post.description}
        date={post.date}
        readingTimeMin={post.readingTimeMin}
      />

      {relatedConversion && (
        <BlogCTABanner
          conversionSlug={relatedConversion.slug}
          conversionName={conversionName}
          formatColor={formatColor}
        />
      )}

      {/* Blog HTML is developer-authored content from markdown files checked into the
          repository at content/blog/. This is the same trusted-content pattern used by
          SEOContent.tsx — no user-supplied input reaches this path. */}
      <article
        className="prose prose-lg max-w-none"
        dangerouslySetInnerHTML={{ __html: post.html }}
      />

      {relatedConversion && (
        <BlogBottomCTA
          conversionSlug={relatedConversion.slug}
          conversionName={conversionName}
          formatColor={formatColor}
        />
      )}
    </PageShell>
  )
}
