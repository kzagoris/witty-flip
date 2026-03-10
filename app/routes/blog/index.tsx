import { createFileRoute } from "@tanstack/react-router"
import '~/lib/load-env'
import { PageShell } from "~/components/layout/PageShell"
import { BlogPostCard } from "~/components/blog/BlogPostCard"
import { callServerFn } from "~/lib/api-client"
import { getBlogPosts } from "~/server/api/blog"
import type { BlogPostSummary } from "~/lib/blog"

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function renderBlogIndexHtml(posts: BlogPostSummary[]): string {
  const items = posts.length === 0
    ? "<p>No blog posts yet. Check back soon!</p>"
    : posts
      .map(
        (post) => `<article>
  <h2><a href="/blog/${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a></h2>
  <p>${escapeHtml(post.description)}</p>
</article>`,
      )
      .join("\n")

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Blog | WittyFlip</title>
  </head>
  <body>
    <main>
      <h1>WittyFlip Blog</h1>
      ${items}
    </main>
  </body>
</html>`
}

export async function handleBlogIndexRequest(): Promise<Response> {
  const { readAllBlogPosts } = await import("~/lib/blog")
  const posts = readAllBlogPosts()

  return new Response(renderBlogIndexHtml(posts), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  })
}

export async function loadBlogIndexPage(): Promise<{ posts: BlogPostSummary[] }> {
  const result = await callServerFn<BlogPostSummary[]>(getBlogPosts)

  if (!result.ok) {
    throw new Error(`Failed to load blog posts: ${result.error.message}`)
  }

  return { posts: result.data }
}

export const Route = createFileRoute("/blog/")({
  loader: () => loadBlogIndexPage(),
  head: () => {
    const baseUrl = typeof window === "undefined"
      ? (process.env.BASE_URL ?? "https://wittyflip.com").replace(/\/$/, "")
      : window.location.origin
    const canonicalUrl = `${baseUrl}/blog`
    const imageUrl = `${baseUrl}/og-default.png`

    return {
      meta: [
        { title: "Blog | WittyFlip" },
        {
          name: "description",
          content:
            "Guides, tips, and comparisons for document conversion. Learn about DOCX, PDF, Markdown, LaTeX, EPUB, and more.",
        },
        { property: "og:title", content: "Blog | WittyFlip" },
        {
          property: "og:description",
          content:
            "Guides, tips, and comparisons for document conversion. Learn about DOCX, PDF, Markdown, LaTeX, EPUB, and more.",
        },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonicalUrl },
        { property: "og:image", content: imageUrl },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: imageUrl },
      ],
      links: [{ rel: "canonical", href: canonicalUrl }],
    }
  },
  component: BlogIndexPage,
})

function BlogIndexPage() {
  const { posts } = Route.useLoaderData()

  return (
    <PageShell>
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          WittyFlip Blog
        </h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Guides and tips for document conversion
        </p>
      </div>

      {posts.length === 0 ? (
        <p className="text-muted-foreground">No blog posts yet. Check back soon!</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {posts.map((post) => (
            <BlogPostCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </PageShell>
  )
}
