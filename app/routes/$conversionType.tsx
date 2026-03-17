import { createFileRoute, notFound } from "@tanstack/react-router"
import { z } from "zod"
import { ClientConversionPage } from "~/components/conversion/ClientConversionPage"
import { ServerConversionPage } from "~/components/conversion/ServerConversionPage"
import { PageShell } from "~/components/layout/PageShell"
import { callServerFn } from "~/lib/api-client"
import { resolveBaseUrl } from "~/lib/base-url"
import { getConversionBySlug } from "~/lib/conversions"
import {
    buildBreadcrumbSchema,
    buildFAQPageSchema,
    buildSoftwareAppSchema,
} from "~/lib/structured-data"
import type { RateLimitStatusResponse } from "~/server/api/contracts"
import { getRateLimitStatus } from "~/server/api/rate-limit-status"

const searchSchema = z.object({
    fileId: z.string().optional(),
    attemptId: z.string().optional(),
    session_id: z.string().optional(),
    canceled: z.coerce.boolean().optional(),
})

export const Route = createFileRoute("/$conversionType")({
    validateSearch: (search) => searchSchema.parse(search),
    staleTime: 60_000,
    shouldReload: false,
    loader: async ({ params }) => {
        const conversion = getConversionBySlug(params.conversionType)
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        if (!conversion) throw notFound()

        const quotaResult = await callServerFn<RateLimitStatusResponse>(getRateLimitStatus)

        return {
            conversion,
            initialQuota: quotaResult.ok ? quotaResult.data : null,
        }
    },
    head: ({ loaderData }) => {
        if (!loaderData) return {}
        const { conversion } = loaderData
        const baseUrl = resolveBaseUrl()
        const canonicalUrl = `${baseUrl}/${conversion.slug}`
        const faqSchema = buildFAQPageSchema(conversion.faq)
        const appSchema = buildSoftwareAppSchema(conversion)
        const breadcrumbSchema = buildBreadcrumbSchema(conversion)

        return {
            meta: [
                { title: conversion.seo.title },
                { name: "description", content: conversion.seo.description },
                { name: "keywords", content: conversion.seo.keywords.join(", ") },
                { property: "og:title", content: conversion.seo.title },
                { property: "og:description", content: conversion.seo.description },
                { property: "og:type", content: "website" },
                { property: "og:url", content: canonicalUrl },
                { name: "twitter:card", content: "summary" },
                { name: "twitter:title", content: conversion.seo.title },
                { name: "twitter:description", content: conversion.seo.description },
            ],
            links: [{ rel: "canonical", href: canonicalUrl }],
            scripts: [
                {
                    type: "application/ld+json",
                    children: JSON.stringify(faqSchema),
                },
                {
                    type: "application/ld+json",
                    children: JSON.stringify(appSchema),
                },
                {
                    type: "application/ld+json",
                    children: JSON.stringify(breadcrumbSchema),
                },
            ],
        }
    },
    notFoundComponent: () => (
        <PageShell>
            <div className="py-16 text-center">
                <h1 className="font-heading text-3xl font-bold">Conversion Not Found</h1>
                <p className="mt-2 text-muted-foreground">The requested conversion type is not supported.</p>
            </div>
        </PageShell>
    ),
    component: ConversionPage,
})

function ConversionPage() {
    const { conversion, initialQuota } = Route.useLoaderData()
    const search = Route.useSearch()

    if (conversion.processingMode === "client") {
        return (
            <ClientConversionPage
                conversion={conversion}
                initialQuota={initialQuota}
                search={{
                    attemptId: search.attemptId,
                    session_id: search.session_id,
                    canceled: search.canceled,
                }}
            />
        )
    }

    return (
        <ServerConversionPage
            conversion={conversion}
            initialQuota={initialQuota}
            search={{
                fileId: search.fileId,
                session_id: search.session_id,
                canceled: search.canceled,
            }}
        />
    )
}
