import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { createTestApp } from "../helpers/create-test-app"

import type { TestApp } from "../helpers/create-test-app"

let tempDir: string
let blogDir: string
let app: TestApp

const samplePost = `---
title: "Integration Test Post"
description: "A post for integration testing"
date: "2026-03-10"
slug: "integration-test-post"
relatedConversion: "docx-to-markdown"
---

This is the integration test post body.
`

const invalidPost = `---
title: "Invalid Draft"
description: "This should not appear in the sitemap"
date: "2026-03-11"
slug: "invalid-draft"
relatedConversion: "fake-to-fake"
---

This post should be filtered out.
`

describe("blog integration", () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "blog-int-test-"))
    blogDir = path.join(tempDir, "content", "blog")
    fs.mkdirSync(blogDir, { recursive: true })
    fs.writeFileSync(path.join(blogDir, "integration-test-post.md"), samplePost, "utf-8")
    fs.writeFileSync(path.join(blogDir, "invalid-draft.md"), invalidPost, "utf-8")
  })

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  // Set env vars AFTER the global beforeEach (setup.ts) resets env
  beforeEach(() => {
    vi.resetModules()
    process.env["BLOG_CONTENT_DIR"] = blogDir
    process.env["BASE_URL"] = "https://wittyflip.com"
  })

  beforeEach(async () => {
    app = await createTestApp()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(async () => {
    await app.close()
  })

  describe("blog routes", () => {
    it("loads the blog index page", async () => {
      const response = await app.request.get("/blog")

      expect(response.status).toBe(200)
      expect(response.headers["content-type"]).toContain("text/html")
      expect(response.text).toContain("WittyFlip Blog")
      expect(response.text).toContain("Integration Test Post")
      expect(response.text).not.toContain("Invalid Draft")
    })

    it("loads an individual blog post route", async () => {
      const response = await app.request.get("/blog/integration-test-post")

      expect(response.status).toBe(200)
      expect(response.headers["content-type"]).toContain("text/html")
      expect(response.text).toContain("Integration Test Post")
      expect(response.text).toContain("integration test post body")
    })

    it("returns 404 for a missing blog post", async () => {
      const response = await app.request.get("/blog/nonexistent")

      expect(response.status).toBe(404)
    })

    it("surfaces blog post server errors instead of masking them as a 404", async () => {
      const originalReadFileSync = fs.readFileSync.bind(fs)
      vi.spyOn(fs, "readFileSync").mockImplementation(((...args: Parameters<typeof fs.readFileSync>) => {
        const filePath = args[0]
        if (typeof filePath === "string" && filePath.endsWith("integration-test-post.md")) {
          throw new Error("forced blog read failure")
        }

        return originalReadFileSync(...args)
      }) as typeof fs.readFileSync)

      const response = await app.request.get("/blog/integration-test-post")

      expect(response.status).toBe(500)
      expect(response.body).toMatchObject({
        error: "test_app_error",
        message: "forced blog read failure",
      })
    })

    it("surfaces blog index server errors instead of masking them as an empty state", async () => {
      const brokenPath = path.join(blogDir, "integration-test-post.md")
      process.env["BLOG_CONTENT_DIR"] = brokenPath

      const response = await app.request.get("/blog")

      expect(response.status).toBe(500)
      const body = response.body as { error?: string; message?: string }

      expect(body).toMatchObject({
        error: "test_app_error",
      })
      expect(body.message).toContain("ENOTDIR")
    })
  })

  describe("sitemap includes blog URLs", () => {
    it("includes /blog and valid blog post URLs in sitemap XML", async () => {
      const { handleSitemapRequest } = await import("~/routes/api/sitemap[.]xml")

      const response = await handleSitemapRequest()
      const xml = await response.text()

      expect(response.headers.get("Content-Type")).toBe("application/xml")
      expect(xml).toContain("<loc>https://wittyflip.com/blog</loc>")
      expect(xml).toContain("<loc>https://wittyflip.com/blog/integration-test-post</loc>")
      expect(xml).not.toContain("invalid-draft")
      expect(xml).toContain("<loc>https://wittyflip.com/docx-to-markdown</loc>")
    })
  })
})
