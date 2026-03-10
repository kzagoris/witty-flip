import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

let tempDir: string
let blogDir: string

function writeTempPost(filename: string, content: string) {
  fs.writeFileSync(path.join(blogDir, filename), content, "utf-8")
}

const validPost = `---
title: "Test Post"
description: "A test post description"
date: "2026-03-10"
slug: "valid-post"
relatedConversion: "docx-to-markdown"
---

This is the body of the test post with enough words to test reading time.
`

const validPostTwo = `---
title: "Second Post"
description: "Another test post"
date: "2026-03-08"
slug: "second-post"
relatedConversion: "djvu-to-pdf"
---

Second post content goes here.
`

describe("blog data layer", () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "blog-test-"))
    blogDir = path.join(tempDir, "content", "blog")
    fs.mkdirSync(blogDir, { recursive: true })
    // Write all test posts upfront
    writeTempPost("valid-post.md", validPost)
    writeTempPost("second-post.md", validPostTwo)
    writeTempPost("mismatched-filename.md", `---
title: "Mismatch"
description: "Slug does not match"
date: "2026-01-01"
slug: "wrong-slug"
relatedConversion: "docx-to-markdown"
---

Content.
`)
    writeTempPost("missing-title.md", `---
description: "No title field"
date: "2026-01-01"
slug: "missing-title"
relatedConversion: "docx-to-markdown"
---

Content.
`)
    writeTempPost("bad-conversion.md", `---
title: "Bad Conversion"
description: "Invalid related conversion"
date: "2026-01-01"
slug: "bad-conversion"
relatedConversion: "fake-to-fake"
---

Content.
`)
    writeTempPost("bad-date.md", `---
title: "Bad Date"
description: "Invalid date format"
date: "March 10 2026"
slug: "bad-date"
relatedConversion: "docx-to-markdown"
---

Content.
`)
  })

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  // Set env var AFTER the global beforeEach (setup.ts) resets env
  beforeEach(() => {
    process.env["BLOG_CONTENT_DIR"] = blogDir
  })

  describe("readBlogPost", () => {
    it("returns a valid blog post with parsed HTML", async () => {
      const { readBlogPost } = await import("~/lib/blog")
      const post = readBlogPost("valid-post")

      expect(post).not.toBeNull()
      expect(post!.slug).toBe("valid-post")
      expect(post!.title).toBe("Test Post")
      expect(post!.description).toBe("A test post description")
      expect(post!.date).toBe("2026-03-10")
      expect(post!.relatedConversion).toBe("docx-to-markdown")
      expect(post!.html).toContain("<p>")
      expect(post!.readingTimeMin).toBeGreaterThanOrEqual(1)
    })

    it("returns null for nonexistent slug", async () => {
      const { readBlogPost } = await import("~/lib/blog")
      const post = readBlogPost("nonexistent-slug")
      expect(post).toBeNull()
    })

    it("returns null when slug does not match filename", async () => {
      const { readBlogPost } = await import("~/lib/blog")
      const post = readBlogPost("mismatched-filename")
      expect(post).toBeNull()
    })

    it("returns null when required frontmatter field is missing", async () => {
      const { readBlogPost } = await import("~/lib/blog")
      const post = readBlogPost("missing-title")
      expect(post).toBeNull()
    })

    it("returns null when relatedConversion is invalid", async () => {
      const { readBlogPost } = await import("~/lib/blog")
      const post = readBlogPost("bad-conversion")
      expect(post).toBeNull()
    })

    it("returns null when date format is invalid", async () => {
      const { readBlogPost } = await import("~/lib/blog")
      const post = readBlogPost("bad-date")
      expect(post).toBeNull()
    })
  })

  describe("readAllBlogPosts", () => {
    it("returns posts sorted newest first", async () => {
      const { readAllBlogPosts } = await import("~/lib/blog")
      const posts = readAllBlogPosts()

      const validPosts = posts.filter((p) => p.slug === "valid-post" || p.slug === "second-post")
      expect(validPosts).toHaveLength(2)
      expect(validPosts[0].slug).toBe("valid-post") // 2026-03-10
      expect(validPosts[1].slug).toBe("second-post") // 2026-03-08
    })

    it("skips posts with invalid frontmatter", async () => {
      const { readAllBlogPosts } = await import("~/lib/blog")
      const posts = readAllBlogPosts()

      const slugs = posts.map((p) => p.slug)
      expect(slugs).not.toContain("missing-title")
      expect(slugs).not.toContain("bad-conversion")
      expect(slugs).not.toContain("wrong-slug")
    })
  })

  describe("readAllBlogSlugs", () => {
    it("returns all markdown filenames as slugs", async () => {
      const { readAllBlogSlugs } = await import("~/lib/blog")
      const slugs = readAllBlogSlugs()

      expect(slugs).toContain("valid-post")
      expect(slugs).toContain("second-post")
    })
  })

  describe("reading time", () => {
    it("estimates at least 1 minute for short content", async () => {
      const { readBlogPost } = await import("~/lib/blog")
      const post = readBlogPost("valid-post")
      expect(post).not.toBeNull()
      expect(post!.readingTimeMin).toBe(1)
    })
  })
})
