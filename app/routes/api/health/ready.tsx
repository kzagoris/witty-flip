import { createFileRoute } from "@tanstack/react-router"
import { resolveRequestId, withRequestIdHeader } from "~/lib/observability"

export async function handleReadinessRequest(request?: Request): Promise<Response> {
    const requestId = resolveRequestId(request)
    const headers = withRequestIdHeader(requestId, { "Cache-Control": "no-store" })
    const timestamp = new Date().toISOString()
    const [{ createRequestLogger }, conversionFilesModule, fsModule, pathModule, conversionsModule, convertersModule, registerAllConvertersModule] = await Promise.all([
        import("~/lib/server-observability"),
        import("~/lib/conversion-files"),
        import("node:fs/promises"),
        import("node:path"),
        import("~/lib/conversions"),
        import("~/lib/converters"),
        import("~/lib/converters/register-all"),
    ])
    const requestLogger = createRequestLogger("/api/health/ready", requestId)

    let degraded = false
    let dbLatencyMs: number | undefined

    const checks: {
        database: { status: string; latencyMs?: number; errorCode?: string }
        storage: { status: string; path: string; writable?: boolean; errorCode?: string }
        converters: { status: string; requiredTools: string[]; missingTools: string[]; coverage: string }
    } = {
        database: {
            status: "ok",
        },
        storage: {
            status: "ok",
            path: conversionFilesModule.CONVERSIONS_DIR,
            writable: true,
        },
        converters: {
            status: "ok",
            requiredTools: [],
            missingTools: [],
            coverage: "registered",
        },
    }

    try {
        registerAllConvertersModule.registerAllConverters()
    } catch (error) {
        requestLogger.error({ err: error }, "Converter registration failed during readiness check")
        degraded = true
        checks.converters.status = "down"
        checks.converters.coverage = "registration_failed"
        checks.converters.missingTools = ["registration_failed"]
    }

    const databaseStartTime = performance.now()
    try {
        const [{ db }, { sql }] = await Promise.all([
            import("~/lib/db"),
            import("drizzle-orm"),
        ])
        await db.run(sql`SELECT 1`)
        dbLatencyMs = Math.round(performance.now() - databaseStartTime)
        checks.database.latencyMs = dbLatencyMs
    } catch (error) {
        degraded = true
        checks.database.status = "down"
        checks.database.errorCode = "database_unavailable"
        requestLogger.error({ err: error }, "Database readiness check failed")
    }

    try {
        await conversionFilesModule.ensureConversionsDir()
        const probePath = pathModule.join(conversionFilesModule.CONVERSIONS_DIR, `.ready-${requestId}.tmp`)
        await fsModule.writeFile(probePath, "")
        await fsModule.rm(probePath, { force: true })
        checks.storage.writable = true
    } catch (error) {
        degraded = true
        checks.storage.status = "down"
        checks.storage.writable = false
        checks.storage.errorCode = "storage_unavailable"
        requestLogger.error({ err: error, path: conversionFilesModule.CONVERSIONS_DIR }, "Storage readiness check failed")
    }

    const requiredTools = [...new Set(conversionsModule.getAllConversionTypes().map(conversion => conversion.toolName))]
    const missingTools = requiredTools.filter(toolName => !convertersModule.getConverter(toolName))
    checks.converters.requiredTools = requiredTools
    checks.converters.missingTools = missingTools
    if (missingTools.length > 0) {
        degraded = true
        checks.converters.status = "down"
        requestLogger.error({ missingTools }, "Converter readiness check failed")
    }

    return Response.json(
        {
            status: degraded ? "degraded" : "ok",
            uptime: Math.floor(process.uptime()),
            timestamp,
            ...(dbLatencyMs !== undefined ? { dbLatencyMs } : {}),
            checks,
        },
        {
            status: degraded ? 503 : 200,
            headers,
        },
    )
}

export const Route = createFileRoute("/api/health/ready")({
    server: {
        handlers: {
            GET: ({ request }) => handleReadinessRequest(request),
        },
    },
})
