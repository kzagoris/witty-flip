import { createFileRoute } from "@tanstack/react-router"

export async function handleMetricsRequest(request: Request): Promise<Response> {
    const metricsApiKey = process.env.METRICS_API_KEY
    if (!metricsApiKey) {
        return Response.json(
            { error: "metrics_not_configured", message: "Metrics API key not configured." },
            { status: 503, headers: { "Cache-Control": "no-store" } },
        )
    }

    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.length <= 7) {
        return Response.json(
            { error: "unauthorized", message: "Missing or malformed Authorization header." },
            { status: 401, headers: { "Cache-Control": "no-store" } },
        )
    }

    const token = authHeader.slice(7)
    if (token !== metricsApiKey) {
        return Response.json(
            { error: "unauthorized", message: "Invalid API key." },
            { status: 401, headers: { "Cache-Control": "no-store" } },
        )
    }

    const [fs, { db }, { conversions }, { eq, sql }, { MAX_CONCURRENT_JOBS }, { CONVERSIONS_DIR }] = await Promise.all([
        import("node:fs/promises"),
        import("~/lib/db"),
        import("~/lib/db/schema"),
        import("drizzle-orm"),
        import("~/lib/queue"),
        import("~/lib/conversion-files"),
    ])

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const [diskStats, queueStats, conversionStats, lastSuccess] = await Promise.all([
        // Disk stats
        (async () => {
            try {
                const entries = await fs.readdir(CONVERSIONS_DIR, { withFileTypes: true })
                const files = entries.filter(e => e.isFile())

                const statResults = await Promise.all(
                    files.map(entry =>
                        fs.stat(`${CONVERSIONS_DIR}/${entry.name}`)
                            .then(stat => stat.size)
                            .catch(() => 0),
                    ),
                )

                const usedBytes = statResults.reduce((sum, size) => sum + size, 0)
                const fileCount = files.length

                let totalBytes = 0
                let usedPercent = 0
                try {
                    const fsStats = await fs.statfs(CONVERSIONS_DIR)
                    totalBytes = fsStats.bsize * fsStats.blocks
                    const usedFsBytes = fsStats.bsize * (fsStats.blocks - fsStats.bfree)
                    usedPercent = totalBytes > 0 ? Math.round((usedFsBytes / totalBytes) * 100) : 0
                } catch {
                    // statfs may not work on all platforms
                }

                return { usedBytes, totalBytes, usedPercent, fileCount }
            } catch {
                return { usedBytes: 0, totalBytes: 0, usedPercent: 0, fileCount: 0 }
            }
        })(),

        // Queue stats
        (async () => {
            const [activeResult, queuedResult] = await Promise.all([
                db
                    .select({ count: sql<number>`count(*)` })
                    .from(conversions)
                    .where(eq(conversions.status, "converting")),
                db
                    .select({ count: sql<number>`count(*)` })
                    .from(conversions)
                    .where(eq(conversions.status, "queued")),
            ])
            return {
                activeJobs: activeResult[0]?.count ?? 0,
                queuedJobs: queuedResult[0]?.count ?? 0,
                maxConcurrent: MAX_CONCURRENT_JOBS,
            }
        })(),

        // Conversion stats (last 1hr)
        (async () => {
            const rows = await db
                .select({
                    total: sql<number>`count(*)`,
                    successful: sql<number>`sum(case when ${conversions.status} = 'completed' then 1 else 0 end)`,
                    failed: sql<number>`sum(case when ${conversions.status} = 'failed' then 1 else 0 end)`,
                    timeout: sql<number>`sum(case when ${conversions.status} = 'timeout' then 1 else 0 end)`,
                    avgDurationMs: sql<number>`avg(${conversions.conversionTimeMs})`,
                })
                .from(conversions)
                .where(
                    sql`${conversions.conversionCompletedAt} >= ${oneHourAgo} AND ${conversions.status} IN ('completed', 'failed', 'timeout')`,
                )

            const row = rows[0]
            const total = row?.total ?? 0
            const successful = row?.successful ?? 0
            const failed = row?.failed ?? 0
            const timeout = row?.timeout ?? 0
            const avgDurationMs = total > 0 ? Math.round(row?.avgDurationMs ?? 0) : 0
            const successRate = total > 0 ? Math.round((successful / total) * 100) : 100

            return { total, successful, failed, timeout, successRate, avgDurationMs }
        })(),

        // Last successful conversion (all time)
        (async () => {
            const [row] = await db
                .select({ completedAt: conversions.conversionCompletedAt })
                .from(conversions)
                .where(eq(conversions.status, "completed"))
                .orderBy(sql`${conversions.conversionCompletedAt} DESC`)
                .limit(1)
            return row?.completedAt ?? null
        })(),
    ])

    return Response.json(
        {
            disk: diskStats,
            queue: queueStats,
            conversions: {
                last1h: conversionStats,
                lastSuccessfulAt: lastSuccess,
            },
            system: {
                uptime: Math.floor(process.uptime()),
                timestamp: new Date().toISOString(),
            },
        },
        {
            status: 200,
            headers: { "Cache-Control": "no-store" },
        },
    )
}

export const Route = createFileRoute("/api/metrics")({
    server: {
        handlers: {
            GET: ({ request }) => handleMetricsRequest(request),
        },
    },
})
