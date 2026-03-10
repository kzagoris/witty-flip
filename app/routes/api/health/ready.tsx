import { createFileRoute } from "@tanstack/react-router"
import { resolveRequestId, withRequestIdHeader } from "~/lib/observability"

export async function handleReadinessRequest(request?: Request): Promise<Response> {
    const requestId = resolveRequestId(request)
    const headers = withRequestIdHeader(requestId, { "Cache-Control": "no-store" })
    const startTime = performance.now()

    try {
        const { db } = await import("~/lib/db")
        const { sql } = await import("drizzle-orm")
        await db.run(sql`SELECT 1`)
        const dbLatencyMs = Math.round(performance.now() - startTime)

        return Response.json(
            {
                status: "ok",
                uptime: Math.floor(process.uptime()),
                timestamp: new Date().toISOString(),
                dbLatencyMs,
                checks: {
                    database: {
                        status: "ok",
                        latencyMs: dbLatencyMs,
                    },
                },
            },
            {
                status: 200,
                headers,
            },
        )
    } catch {
        return Response.json(
            {
                status: "degraded",
                uptime: Math.floor(process.uptime()),
                timestamp: new Date().toISOString(),
                checks: {
                    database: {
                        status: "down",
                        errorCode: "database_unavailable",
                    },
                },
            },
            {
                status: 503,
                headers,
            },
        )
    }
}

export const Route = createFileRoute("/api/health/ready")({
    server: {
        handlers: {
            GET: ({ request }) => handleReadinessRequest(request),
        },
    },
})
