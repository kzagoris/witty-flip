import { createFileRoute } from "@tanstack/react-router"

export async function handleReadinessRequest(): Promise<Response> {
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
            },
            {
                status: 200,
                headers: { "Cache-Control": "no-store" },
            },
        )
    } catch {
        return Response.json(
            {
                status: "degraded",
                uptime: Math.floor(process.uptime()),
                timestamp: new Date().toISOString(),
            },
            {
                status: 503,
                headers: { "Cache-Control": "no-store" },
            },
        )
    }
}

export const Route = createFileRoute("/api/health/ready")({
    server: {
        handlers: {
            GET: () => handleReadinessRequest(),
        },
    },
})
