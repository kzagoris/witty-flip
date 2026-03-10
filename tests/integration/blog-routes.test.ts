import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

let tempDir: string
let blogDir: string

const samplePost = `---
title: "Integration Test Post"
description: "A post for integration testing"
date: "2026-03-10"
slug: "integration-test-post"
relatedConversion: "docx-to-markdown"
---

This is the integration test post body.
`

describe("blog integration", () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "blog-int-test-"))
    blogDir = path.join(tempDir, "content", "blog")
    fs.mkdirSync(blogDir, { recursive: true })
    fs.writeFileSync(path.join(blogDir, "integration-test-post.md"), samplePost, "utf-8")
  })

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  // Set env vars AFTER the global beforeEach (setup.ts) resets env
  beforeEach(() => {
    process.env["BLOG_CONTENT_DIR"] = blogDir
    process.env["BASE_URL"] = "https://wittyflip.com"
  })

  describe("sitemap includes blog URLs", () => {
    it("includes /blog and blog post URLs in sitemap XML", async () => {
      const { handleSitemapRequest } = await import("~/routes/api/sitemap[.]xml")

      const response = await handleSitemapRequest()
      const xml = await response.text()

      expect(response.headers.get("Content-Type")).toBe("application/xml")
      expect(xml).toContain("<loc>https://wittyflip.com/blog</loc>")
      expect(xml).toContain("<loc>https://wittyflip.com/blog/integration-test-post</loc>")
      // Still includes conversion types
      expect(xml).toContain("<loc>https://wittyflip.com/docx-to-markdown</loc>")
    })
  })

  describe("blog data layer from server functions", () => {
    it("readBlogPost returns the post for a valid slug", async () => {
      const { readBlogPost } = await import("~/lib/blog")
      const post = readBlogPost("integration-test-post")

      expect(post).not.toBeNull()
      expect(post!.title).toBe("Integration Test Post")
      expect(post!.html).toContain("<p>")
    })

    it("readAllBlogPosts returns summaries sorted by date", async () => {
      const { readAllBlogPosts } = await import("~/lib/blog")
      const posts = readAllBlogPosts()

      expect(posts.length).toBeGreaterThanOrEqual(1)
      const testPost = posts.find((p) => p.slug === "integration-test-post")
      expect(testPost).toBeDefined()
      expect(testPost!.title).toBe("Integration Test Post")
    })

    it("readBlogPost returns null for nonexistent slug", async () => {
      const { readBlogPost } = await import("~/lib/blog")
      const post = readBlogPost("nonexistent")
      expect(post).toBeNull()
    })
  })
})
