import { createFileRoute } from "@tanstack/react-router"
import { resolveRequestId, withRequestIdHeader } from "~/lib/observability"

export async function handleReadinessRequest(request?: Request): Promise<Response> {
    const requestId = resolveRequestId(request)
    const headers = withRequestIdHeader(requestId, { "Cache-Control": "no-store" })
    const timestamp = new Date().toISOString()
    const [{ createRequestLogger }, conversionFilesModule, fsModule, pathModule] = await Promise.all([
        import("~/lib/server-observability"),
        import("~/lib/conversion-files"),
        import("node:fs/promises"),
        import("node:path"),
    ])
    const requestLogger = createRequestLogger("/api/health/ready", requestId)

    let degraded = false
    let dbLatencyMs: number | undefined

    const checks: {
        database: { status: string; latencyMs?: number; errorCode?: string }
        storage: { status: string; writable?: boolean; errorCode?: string }
    } = {
        database: {
            status: "ok",
        },
        storage: {
            status: "ok",
            writable: true,
        },
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
        requestLogger.error({ err: error }, "Storage readiness check failed")
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
