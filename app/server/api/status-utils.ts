import fs from "node:fs/promises"
import { resolveOutputPath } from "~/lib/conversion-files"
import { statusToProgress, type ConversionStatusResponse } from "./contracts"

interface ConversionStatusRecord {
    id: string
    status: string | null
    expiresAt: string | null
    conversionType: string
    errorMessage: string | null
    outputFilePath: string | null
    [key: string]: unknown
}

async function markCompletedArtifactMissing(conversionId: string): Promise<void> {
    const [{ and, eq }, { db }, { conversions }] = await Promise.all([
        import("drizzle-orm"),
        import("~/lib/db"),
        import("~/lib/db/schema"),
    ])

    await db
        .update(conversions)
        .set({
            status: "failed",
            errorMessage: "The converted file is no longer available. Please convert the file again.",
        })
        .where(and(eq(conversions.id, conversionId), eq(conversions.status, "completed")))
}

export async function buildConversionStatusPayload(
    conversion: ConversionStatusRecord,
): Promise<ConversionStatusResponse> {
    if (
        (conversion.status === "completed" || conversion.status === "expired") &&
        conversion.expiresAt &&
        new Date(conversion.expiresAt).getTime() <= Date.now()
    ) {
        if (conversion.status !== "expired") {
            const [{ eq }, { db }, { conversions }] = await Promise.all([
                import("drizzle-orm"),
                import("~/lib/db"),
                import("~/lib/db/schema"),
            ])

            await db.update(conversions).set({ status: "expired" }).where(eq(conversions.id, conversion.id))
        }

        return {
            fileId: conversion.id,
            status: "expired",
            progress: statusToProgress("expired"),
            expiresAt: conversion.expiresAt,
            message: "Download window has expired.",
        }
    }

    if (conversion.status === "completed") {
        const outputPath = resolveOutputPath(conversion.id, conversion.conversionType, conversion.outputFilePath)

        if (!outputPath) {
            return {
                fileId: conversion.id,
                status: "failed",
                progress: statusToProgress("failed"),
                errorCode: "conversion_failed",
                message: "Conversion metadata is unavailable.",
            }
        }

        try {
            await fs.access(outputPath)
            return {
                fileId: conversion.id,
                status: "completed",
                progress: statusToProgress("completed"),
                downloadUrl: `/api/download/${conversion.id}`,
                expiresAt: conversion.expiresAt ?? undefined,
            }
        } catch {
            await markCompletedArtifactMissing(conversion.id)
            return {
                fileId: conversion.id,
                status: "failed",
                progress: statusToProgress("failed"),
                expiresAt: conversion.expiresAt ?? undefined,
                errorCode: "artifact_missing",
                message: "The converted file is no longer available. Please convert the file again.",
            }
        }
    }

    if (conversion.status === "expired") {
        return {
            fileId: conversion.id,
            status: "expired",
            progress: statusToProgress("expired"),
            expiresAt: conversion.expiresAt ?? undefined,
            message: "Download window has expired.",
        }
    }

    if (conversion.status === "failed") {
        return {
            fileId: conversion.id,
            status: "failed",
            progress: statusToProgress("failed"),
            errorCode: "conversion_failed",
            message: conversion.errorMessage ?? "Conversion failed.",
        }
    }

    if (conversion.status === "timeout") {
        return {
            fileId: conversion.id,
            status: "timeout",
            progress: statusToProgress("timeout"),
            errorCode: "conversion_timeout",
            message: conversion.errorMessage ?? "Conversion timed out.",
        }
    }

    if (conversion.status === "pending_payment") {
        return {
            fileId: conversion.id,
            status: "pending_payment",
            progress: statusToProgress("pending_payment"),
            message: "Processing payment...",
        }
    }

    if (conversion.status === "payment_required") {
        return {
            fileId: conversion.id,
            status: "payment_required",
            progress: statusToProgress("payment_required"),
            message: "Free daily limit reached. Complete payment to continue.",
        }
    }

    if (conversion.status === "queued") {
        return {
            fileId: conversion.id,
            status: "queued",
            progress: statusToProgress("queued"),
            message: "Queued for conversion.",
        }
    }

    if (conversion.status === "converting") {
        return {
            fileId: conversion.id,
            status: "converting",
            progress: statusToProgress("converting"),
            message: "Conversion in progress.",
        }
    }

    return {
        fileId: conversion.id,
        status: "uploaded",
        progress: statusToProgress("uploaded"),
        message: "Ready to convert.",
    }
}
