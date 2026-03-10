import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import { marked } from "marked"
import '~/lib/load-env'
import { createChildLogger } from "~/lib/logger"
import { getConversionBySlug } from "~/lib/conversions"

const log = createChildLogger({ module: "blog" })
const BLOG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface BlogPost {
  slug: string
  title: string
  description: string
  date: string
  relatedConversion: string
  ogImage?: string
  content: string
  html: string
  readingTimeMin: number
}

export interface BlogPostSummary {
  slug: string
  title: string
  description: string
  date: string
  relatedConversion: string
}

function getBlogDir(): string {
  return process.env["BLOG_CONTENT_DIR"] ?? path.join(process.cwd(), "content", "blog")
}

const REQUIRED_FIELDS = ["title", "description", "date", "slug", "relatedConversion"] as const

function isValidDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value))
}

function estimateReadingTime(text: string): number {
  const wordCount = text.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(wordCount / 200))
}

function isValidBlogSlug(slug: string): boolean {
  return BLOG_SLUG_PATTERN.test(slug)
}

function validateFrontmatter(
  data: Record<string, unknown>,
  filename: string,
): data is Record<string, string> & {
  title: string
  description: string
  date: string
  slug: string
  relatedConversion: string
  ogImage?: string
} {
  for (const field of REQUIRED_FIELDS) {
    if (typeof data[field] !== "string" || data[field].length === 0) {
      log.warn({ filename, field }, "Blog post missing required frontmatter field")
      return false
    }
  }

  const expectedSlug = filename.replace(/\.md$/, "")
  if (data.slug !== expectedSlug) {
    log.warn({ filename, slug: data.slug, expectedSlug }, "Blog post slug does not match filename")
    return false
  }

  if (!isValidBlogSlug(data.slug)) {
    log.warn({ filename, slug: data.slug }, "Blog post slug contains invalid characters")
    return false
  }

  if (!isValidDateString(data.date as string)) {
    log.warn({ filename, date: data.date }, "Blog post has invalid date format")
    return false
  }

  if (!getConversionBySlug(data.relatedConversion as string)) {
    log.warn(
      { filename, relatedConversion: data.relatedConversion },
      "Blog post relatedConversion does not match a valid conversion slug",
    )
    return false
  }

  return true
}

export function readBlogPost(slug: string): BlogPost | null {
  if (!isValidBlogSlug(slug)) {
    log.warn({ slug }, "Blog post slug contains invalid characters")
    return null
  }

  const filepath = path.join(getBlogDir(), `${slug}.md`)

  if (!fs.existsSync(filepath)) {
    return null
  }

  const raw = fs.readFileSync(filepath, "utf-8")
  const { data, content } = matter(raw)
  const filename = `${slug}.md`

  if (!validateFrontmatter(data as Record<string, unknown>, filename)) {
    return null
  }

  const html = marked.parse(content, { async: false })

  return {
    slug: data.slug as string,
    title: data.title as string,
    description: data.description as string,
    date: data.date as string,
    relatedConversion: data.relatedConversion as string,
    ogImage: typeof data.ogImage === "string" ? data.ogImage : undefined,
    content,
    html,
    readingTimeMin: estimateReadingTime(content),
  }
}

export function readAllBlogPosts(): BlogPostSummary[] {
  const blogDir = getBlogDir()

  if (!fs.existsSync(blogDir)) {
    return []
  }

  const files = fs.readdirSync(blogDir).filter((file) => file.endsWith(".md"))
  const posts: BlogPostSummary[] = []

  for (const file of files) {
    const slug = file.replace(/\.md$/, "")
    const post = readBlogPost(slug)

    if (!post) {
      continue
    }

    posts.push({
      slug: post.slug,
      title: post.title,
      description: post.description,
      date: post.date,
      relatedConversion: post.relatedConversion,
    })
  }

  return posts.sort((a, b) => b.date.localeCompare(a.date))
}

export function readAllBlogSlugs(): string[] {
  return readAllBlogPosts().map((post) => post.slug)
}
