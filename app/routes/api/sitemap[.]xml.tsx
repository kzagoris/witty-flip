import { createFileRoute } from "@tanstack/react-router"
import '~/lib/load-env'

export async function handleSitemapRequest(): Promise<Response> {
    const { getAllConversionTypes } = await import("~/lib/conversions")
    const { readAllBlogSlugs } = await import("~/lib/blog")

    const baseUrl = (process.env.BASE_URL ?? "https://wittyflip.com").replace(/\/$/, "")
    const conversionTypes = getAllConversionTypes()
    const blogSlugs = readAllBlogSlugs()

    const urls = [
        `  <url><loc>${baseUrl}/</loc></url>`,
        ...conversionTypes.map(
            (ct) => `  <url><loc>${baseUrl}/${ct.slug}</loc></url>`,
        ),
        `  <url><loc>${baseUrl}/blog</loc></url>`,
        ...blogSlugs.map(
            (slug) => `  <url><loc>${baseUrl}/blog/${slug}</loc></url>`,
        ),
    ]

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`

    return new Response(xml, {
        status: 200,
        headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=86400",
        },
    })
}

export const Route = createFileRoute("/api/sitemap.xml")({
    server: {
        handlers: {
            GET: () => handleSitemapRequest(),
        },
    },
})
