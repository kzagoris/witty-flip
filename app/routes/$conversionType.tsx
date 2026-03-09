import { useCallback, useEffect, useState } from "react"
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { PageShell } from "~/components/layout/PageShell"
import { ConversionHero } from "~/components/conversion/ConversionHero"
import { SEOContent } from "~/components/conversion/SEOContent"
import { FAQSection } from "~/components/conversion/FAQSection"
import { RelatedConversions } from "~/components/conversion/RelatedConversions"
import { FileUploader } from "~/components/conversion/FileUploader"
import { ConversionStatus } from "~/components/conversion/ConversionStatus"
import { ConversionProgress } from "~/components/conversion/ConversionProgress"
import { ErrorCard } from "~/components/conversion/ErrorCard"
import { QuotaBadge } from "~/components/conversion/QuotaBadge"
import { PaymentPrompt } from "~/components/conversion/PaymentPrompt"
import { useConversionFlow } from "~/hooks/useConversionFlow"
import { getConversionBySlug } from "~/lib/conversions"
import { deriveConversionRouteState } from "~/lib/conversion-route-state"
import { getRateLimitStatus } from "~/server/api/rate-limit-status"
import { callServerFn } from "~/lib/api-client"
import type { RateLimitStatusResponse } from "~/server/api/contracts"
import { buildFAQPageSchema, buildSoftwareAppSchema } from "~/lib/structured-data"
import { MAX_FILE_SIZE } from "~/lib/file-validation"

const searchSchema = z.object({
    fileId: z.string().optional(),
    session_id: z.string().optional(),
    canceled: z.coerce.boolean().optional(),
})

export const Route = createFileRoute("/$conversionType")({
    validateSearch: (search) => searchSchema.parse(search),
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
        const faqSchema = buildFAQPageSchema(conversion.faq)
        const appSchema = buildSoftwareAppSchema(conversion)
        return {
            meta: [
                { title: conversion.seo.title },
                { name: "description", content: conversion.seo.description },
                { name: "keywords", content: conversion.seo.keywords.join(", ") },
                { property: "og:title", content: conversion.seo.title },
                { property: "og:description", content: conversion.seo.description },
                { property: "og:type", content: "website" },
            ],
            scripts: [
                {
                    type: "application/ld+json",
                    children: JSON.stringify(faqSchema),
                },
                {
                    type: "application/ld+json",
                    children: JSON.stringify(appSchema),
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
    const { fileId: searchFileId, session_id, canceled } = Route.useSearch()
    const navigate = useNavigate({ from: "/$conversionType" })

    const syncFileIdInSearch = useCallback(
        (fileId: string | null) => {
            void navigate({
                to: "/$conversionType",
                params: { conversionType: conversion.slug },
                search: (prev) => ({
                    ...prev,
                    fileId: fileId ?? undefined,
                    session_id: undefined,
                    canceled: undefined,
                }),
                replace: true,
                resetScroll: false,
            })
        },
        [conversion.slug, navigate],
    )

    const handleExpired = useCallback(() => {
        void navigate({
            to: "/$conversionType",
            params: { conversionType: conversion.slug },
            search: (prev) => ({
                ...prev,
                fileId: undefined,
                session_id: undefined,
                canceled: undefined,
            }),
            replace: true,
            resetScroll: false,
        })
    }, [conversion.slug, navigate])

    const { initialFileId, initialState, initialCanceled } = deriveConversionRouteState({
        fileId: searchFileId,
        session_id,
        canceled,
    })

    const flow = useConversionFlow({
        conversionType: conversion.slug,
        initialFileId,
        initialState,
        initialCanceled,
        onFileIdChange: syncFileIdInSearch,
        onExpired: handleExpired,
    })

    const [quota, setQuota] = useState<RateLimitStatusResponse | null>(initialQuota)

    useEffect(() => {
        setQuota(initialQuota)
    }, [initialQuota])

    const fetchQuota = useCallback(async () => {
        const result = await callServerFn<RateLimitStatusResponse>(getRateLimitStatus)
        if (result.ok) {
            setQuota(result.data)
        }
    }, [])

    useEffect(() => {
        if (initialQuota == null && flow.state === "idle") {
            void fetchQuota()
        }
    }, [fetchQuota, flow.state, initialQuota])

    useEffect(() => {
        if (
            flow.state === "converting" ||
            flow.state === "payment_required" ||
            flow.state === "pending_payment" ||
            flow.state === "completed" ||
            flow.state === "failed" ||
            flow.state === "timeout" ||
            flow.state === "expired"
        ) {
            void fetchQuota()
        }
    }, [flow.state, fetchQuota])

    const maxSizeMB = MAX_FILE_SIZE / (1024 * 1024)

    const renderFlowSection = () => {
        if (flow.state === "idle") {
            return (
                <>
                    <FileUploader
                        sourceExtensions={conversion.sourceExtensions}
                        sourceMimeTypes={conversion.sourceMimeTypes}
                        maxSizeMB={maxSizeMB}
                        onFileSelected={(file) => void flow.startUpload(file)}
                    />
                </>
            )
        }

        if (flow.state === "uploading") {
            return <ConversionProgress progress={5} message="Uploading file..." />
        }

        if (flow.state === "payment_required") {
            return <PaymentPrompt fileId={flow.fileId!} notice={flow.canceledMessage ?? undefined} />
        }

        if (flow.state === "failed" || flow.state === "timeout") {
            return (
                <ErrorCard
                    errorCode={flow.error?.error}
                    message={flow.error?.message ?? "Something went wrong."}
                    onRetry={flow.reset}
                />
            )
        }

        if (flow.state === "expired") {
            return (
                <ErrorCard message="Download window has expired. Please convert the file again." onRetry={flow.reset} />
            )
        }

        if (flow.status) {
            return (
                <ConversionStatus
                    status={flow.status}
                    targetFormat={conversion.targetFormat}
                    fileId={flow.fileId!}
                    onReset={flow.reset}
                    onExpired={flow.markExpired}
                />
            )
        }

        return <ConversionProgress progress={25} message="Starting conversion..." />
    }

    return (
        <PageShell>
            <ConversionHero conversion={conversion} />

            <div className="mt-8 space-y-6">
                {quota && (
                    <div className="flex justify-center">
                        <QuotaBadge remaining={quota.remaining} limit={quota.limit} />
                    </div>
                )}

                {renderFlowSection()}
            </div>

            <SEOContent html={conversion.seoContent} />
            <FAQSection faqs={conversion.faq} />
            <RelatedConversions slugs={conversion.relatedConversions} />
        </PageShell>
    )
}
