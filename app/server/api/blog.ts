import { createServerFn, createServerOnlyFn } from "@tanstack/react-start"
import { isRecord } from "./contracts"
import type { BlogPost, BlogPostSummary } from "~/lib/blog"

interface BlogServerDeps {
  readBlogPost: typeof import("~/lib/blog").readBlogPost
  readAllBlogPosts: typeof import("~/lib/blog").readAllBlogPosts
}

let blogServerDepsPromise: Promise<BlogServerDeps> | undefined

const getBlogServerDeps = createServerOnlyFn(async (): Promise<BlogServerDeps> => {
  blogServerDepsPromise ??= import("~/lib/blog").then((mod) => ({
    readBlogPost: mod.readBlogPost,
    readAllBlogPosts: mod.readAllBlogPosts,
  }))

  return blogServerDepsPromise
})

export const getBlogPostBySlug = createServerFn({ method: "GET" }).handler(
  async ({ data }): Promise<BlogPost | null> => {
    const { readBlogPost } = await getBlogServerDeps()

    if (!isRecord(data) || typeof data["slug"] !== "string") {
      return null
    }

    return readBlogPost(data["slug"])
  },
)

export const getBlogPosts = createServerFn({ method: "GET" }).handler(
  async (): Promise<BlogPostSummary[]> => {
    const { readAllBlogPosts } = await getBlogServerDeps()
    return readAllBlogPosts()
  },
)
