import { createFileRoute, notFound } from "@tanstack/react-router"
import '~/lib/load-env'
import { PageShell } from "~/components/layout/PageShell"
import { BlogPostHeader } from "~/components/blog/BlogPostHeader"
import { BlogCTABanner } from "~/components/blog/BlogCTABanner"
import { BlogBottomCTA } from "~/components/blog/BlogBottomCTA"
import { getConversionBySlug } from "~/lib/conversions"
import { callServerFn } from "~/lib/api-client"
import { resolveBaseUrl } from "~/lib/base-url"
import { getBlogPostBySlug } from "~/server/api/blog"
import type { BlogPost } from "~/lib/blog"

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function renderBlogPostHtml(post: BlogPost): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(post.title)} | WittyFlip Blog</title>
  </head>
  <body>
    <main>
      <a href="/blog">Back to Blog</a>
      <h1>${escapeHtml(post.title)}</h1>
      <p>${escapeHtml(post.description)}</p>
      <article>${post.html}</article>
    </main>
  </body>
</html>`
}

export async function handleBlogPostRequest(slug: string): Promise<Response> {
  const { readBlogPost } = await import("~/lib/blog")
  const post = readBlogPost(slug)

  if (!post) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    })
  }

  return new Response(renderBlogPostHtml(post), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  })
}


export async function loadBlogPostPage(
  slug: string,
): Promise<{ post: BlogPost; relatedConversion: ReturnType<typeof getConversionBySlug>; baseUrl: string }> {
  const result = await callServerFn<BlogPost | null>(getBlogPostBySlug, { slug })

  if (!result.ok) {
    throw new Error(`Failed to load blog post "${slug}": ${result.error.message}`)
  }

  if (!result.data) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw notFound()
  }

  const post = result.data
  const relatedConversion = getConversionBySlug(post.relatedConversion)

  return {
    post,
    relatedConversion,
    baseUrl: resolveBaseUrl(),
  }
}

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => loadBlogPostPage(params.slug),
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
