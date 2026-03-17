import { createFileRoute } from "@tanstack/react-router"
import '~/lib/load-env'
import { resolveRequestId, withRequestIdHeader } from "~/lib/observability"

interface AggregatedToolStats {
    toolName: string
    total: number
    successful: number
    failed: number
    timeout: number
    successRate: number
    avgDurationMs: number
    p95DurationMs: number
}

interface ClientConversionMetricCounts {
    total: number
    reserved: number
    paymentRequired: number
    pendingPayment: number
    ready: number
    completed: number
    failed: number
    expired: number
    paid: number
}

interface AggregatedClientConversionStats extends ClientConversionMetricCounts {
    conversionType: string
    avgDurationMs: number
    p95DurationMs: number
}

function calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0

    const sorted = [...values].sort((left, right) => left - right)
    const index = Math.max(0, Math.ceil(sorted.length * percentile) - 1)
    return sorted[Math.min(index, sorted.length - 1)] ?? 0
}

function createEmptyClientConversionCounts(): ClientConversionMetricCounts {
    return {
        total: 0,
        reserved: 0,
        paymentRequired: 0,
        pendingPayment: 0,
        ready: 0,
        completed: 0,
        failed: 0,
        expired: 0,
        paid: 0,
    }
}

function incrementClientConversionCounts(
    counts: ClientConversionMetricCounts,
    status: string | null | undefined,
    wasPaid: number | null | undefined,
): void {
    counts.total += 1

    if (wasPaid === 1) {
        counts.paid += 1
    }

    switch (status) {
        case "reserved":
            counts.reserved += 1
            break
        case "payment_required":
            counts.paymentRequired += 1
            break
        case "pending_payment":
            counts.pendingPayment += 1
            break
        case "ready":
            counts.ready += 1
            break
        case "completed":
            counts.completed += 1
            break
        case "failed":
            counts.failed += 1
            break
        case "expired":
            counts.expired += 1
            break
    }
}

function toAgeMs(value: string | null | undefined, nowMs: number): number | null {
    if (!value) return null

    const parsed = Date.parse(value)
    if (Number.isNaN(parsed)) return null

    return Math.max(0, nowMs - parsed)
}

export async function handleMetricsRequest(request: Request): Promise<Response> {
    const requestId = resolveRequestId(request)
    const responseHeaders = withRequestIdHeader(requestId, { "Cache-Control": "no-store" })
    const metricsApiKey = process.env.METRICS_API_KEY
    if (!metricsApiKey) {
        return Response.json(
            { error: "metrics_not_configured", message: "Metrics API key not configured." },
            { status: 503, headers: responseHeaders },
        )
    }

    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.length <= 7) {
        return Response.json(
            { error: "unauthorized", message: "Missing or malformed Authorization header." },
            { status: 401, headers: responseHeaders },
        )
    }

    const token = authHeader.slice(7)
    if (token !== metricsApiKey) {
        return Response.json(
            { error: "unauthorized", message: "Invalid API key." },
            { status: 401, headers: responseHeaders },
        )
    }

    const [
        { createRequestLogger },
        pathModule,
        fs,
        { db },
        { clientConversionAttempts, conversions, conversionEvents },
        { eq, sql },
        { CONVERSION_TIMEOUT_MS, MAX_CONCURRENT_JOBS },
        { CONVERSIONS_DIR },
        { getRequestRateLimitBucketCount },
        conversionsModule,
        convertersModule,
        registerAllConvertersModule,
    ] = await Promise.all([
        import("~/lib/server-observability"),
        import("node:path"),
        import("node:fs/promises"),
        import("~/lib/db"),
        import("~/lib/db/schema"),
        import("drizzle-orm"),
        import("~/lib/queue"),
        import("~/lib/conversion-files"),
        import("~/lib/request-rate-limit"),
        import("~/lib/conversions"),
        import("~/lib/converters"),
        import("~/lib/converters/register-all"),
    ])
    const requestLogger = createRequestLogger("/api/metrics", requestId)

    const nowMs = Date.now()
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const stalledBefore = new Date(nowMs - CONVERSION_TIMEOUT_MS).toISOString()

    const [diskStats, queueStats, conversionStats, clientConversionStats, eventStats, lastSuccess] = await Promise.all([
        // Disk stats
        (async () => {
            try {
                const entries = await fs.readdir(CONVERSIONS_DIR, { withFileTypes: true })
                const files = entries.filter(e => e.isFile())

                const statResults = await Promise.all(
                    files.map(entry =>
                        fs.stat(pathModule.join(CONVERSIONS_DIR, entry.name))
                            .then(stat => stat.size)
                            .catch(() => 0),
                    ),
                )

                const usedBytes = statResults.reduce((sum, size) => sum + size, 0)
                const fileCount = files.length

                let totalBytes = 0
                let usedPercent = 0
                let filesystemStatsAvailable = true
                try {
                    const fsStats = await fs.statfs(CONVERSIONS_DIR)
                    totalBytes = fsStats.bsize * fsStats.blocks
                    const usedFsBytes = fsStats.bsize * (fsStats.blocks - fsStats.bfree)
                    usedPercent = totalBytes > 0 ? Math.round((usedFsBytes / totalBytes) * 100) : 0
                } catch (error) {
                    filesystemStatsAvailable = false
                    requestLogger.warn({ err: error }, "Filesystem capacity metrics are unavailable")
                }

                return {
                    available: true,
                    errorCode: null,
                    filesystemStatsAvailable,
                    usedBytes,
                    totalBytes,
                    usedPercent,
                    fileCount,
                }
            } catch (error) {
                requestLogger.error({ err: error }, "Failed to collect disk usage metrics")
                return {
                    available: false,
                    errorCode: "conversions_dir_unavailable",
                    filesystemStatsAvailable: false,
                    usedBytes: 0,
                    totalBytes: 0,
                    usedPercent: 0,
                    fileCount: 0,
                }
            }
        })(),

        // Queue stats
        (async () => {
            const [activeResult, queuedResult, oldestQueuedResult, oldestConvertingResult, stalledResult] = await Promise.all([
                db
                    .select({ count: sql<number>`count(*)` })
                    .from(conversions)
                    .where(eq(conversions.status, "converting")),
                db
                    .select({ count: sql<number>`count(*)` })
                    .from(conversions)
                    .where(eq(conversions.status, "queued")),
                db
                    .select({ createdAt: conversions.createdAt })
                    .from(conversions)
                    .where(eq(conversions.status, "queued"))
                    .orderBy(sql`${conversions.createdAt} ASC`)
                    .limit(1),
                db
                    .select({ conversionStartedAt: conversions.conversionStartedAt })
                    .from(conversions)
                    .where(eq(conversions.status, "converting"))
                    .orderBy(sql`${conversions.conversionStartedAt} ASC`)
                    .limit(1),
                db
                    .select({ count: sql<number>`count(*)` })
                    .from(conversions)
                    .where(
                        sql`${conversions.status} = 'converting' AND ${conversions.conversionStartedAt} IS NOT NULL AND ${conversions.conversionStartedAt} <= ${stalledBefore}`,
                    ),
            ])

            const activeJobs = activeResult[0]?.count ?? 0
            const queuedJobs = queuedResult[0]?.count ?? 0
            const oldestQueuedAgeMs = toAgeMs(oldestQueuedResult[0]?.createdAt ?? null, nowMs)
            const oldestConvertingAgeMs = toAgeMs(oldestConvertingResult[0]?.conversionStartedAt ?? null, nowMs)

            return {
                activeJobs,
                queuedJobs,
                maxConcurrent: MAX_CONCURRENT_JOBS,
                availableSlots: Math.max(0, MAX_CONCURRENT_JOBS - activeJobs),
                oldestQueuedAgeMs,
                oldestConvertingAgeMs,
                stalledJobs: stalledResult[0]?.count ?? 0,
            }
        })(),

        // Conversion stats (last 1hr)
        (async () => {
            const rows = await db
                .select({
                    toolName: conversions.toolName,
                    status: conversions.status,
                    conversionTimeMs: conversions.conversionTimeMs,
                })
                .from(conversions)
                .where(
                    sql`${conversions.conversionCompletedAt} >= ${oneHourAgo} AND ${conversions.status} IN ('completed', 'failed', 'timeout')`,
                )

            const toolStats = new Map<string, {
                total: number
                successful: number
                failed: number
                timeout: number
                durations: number[]
            }>()
            const durations: number[] = []
            let total = 0
            let successful = 0
            let failed = 0
            let timeout = 0

            for (const row of rows) {
                total += 1
                if (row.status === "completed") successful += 1
                if (row.status === "failed") failed += 1
                if (row.status === "timeout") timeout += 1

                if (typeof row.conversionTimeMs === "number") {
                    durations.push(row.conversionTimeMs)
                }

                const toolName = row.toolName ?? "unknown"
                const currentToolStats = toolStats.get(toolName) ?? {
                    total: 0,
                    successful: 0,
                    failed: 0,
                    timeout: 0,
                    durations: [],
                }
                currentToolStats.total += 1
                if (row.status === "completed") currentToolStats.successful += 1
                if (row.status === "failed") currentToolStats.failed += 1
                if (row.status === "timeout") currentToolStats.timeout += 1
                if (typeof row.conversionTimeMs === "number") {
                    currentToolStats.durations.push(row.conversionTimeMs)
                }
                toolStats.set(toolName, currentToolStats)
            }

            const avgDurationMs = durations.length > 0
                ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length)
                : 0
            const successRate = total > 0 ? Math.round((successful / total) * 100) : 100
            const byTool: AggregatedToolStats[] = [...toolStats.entries()]
                .map(([toolName, stats]) => ({
                    toolName,
                    total: stats.total,
                    successful: stats.successful,
                    failed: stats.failed,
                    timeout: stats.timeout,
                    successRate: stats.total > 0 ? Math.round((stats.successful / stats.total) * 100) : 100,
                    avgDurationMs: stats.durations.length > 0
                        ? Math.round(stats.durations.reduce((sum, duration) => sum + duration, 0) / stats.durations.length)
                        : 0,
                    p95DurationMs: calculatePercentile(stats.durations, 0.95),
                }))
                .sort((left, right) => left.toolName.localeCompare(right.toolName))

            return {
                total,
                successful,
                failed,
                timeout,
                successRate,
                avgDurationMs,
                p50DurationMs: calculatePercentile(durations, 0.5),
                p95DurationMs: calculatePercentile(durations, 0.95),
                byTool,
            }
        })(),

        // Client conversion stats (last 1hr)
        (async () => {
            const rows = await db
                .select({
                    conversionType: clientConversionAttempts.conversionType,
                    status: clientConversionAttempts.status,
                    durationMs: clientConversionAttempts.durationMs,
                    wasPaid: clientConversionAttempts.wasPaid,
                })
                .from(clientConversionAttempts)
                .where(
                    sql`datetime(coalesce(${clientConversionAttempts.completedAt}, ${clientConversionAttempts.startedAt})) >= datetime(${oneHourAgo})`,
                )

            const totals = createEmptyClientConversionCounts()
            const durations: number[] = []
            const byConversionStats = new Map<string, ClientConversionMetricCounts & { durations: number[] }>()

            for (const row of rows) {
                incrementClientConversionCounts(totals, row.status, row.wasPaid)

                if (typeof row.durationMs === "number") {
                    durations.push(row.durationMs)
                }

                const currentConversionStats = byConversionStats.get(row.conversionType) ?? {
                    ...createEmptyClientConversionCounts(),
                    durations: [],
                }

                incrementClientConversionCounts(currentConversionStats, row.status, row.wasPaid)

                if (typeof row.durationMs === "number") {
                    currentConversionStats.durations.push(row.durationMs)
                }

                byConversionStats.set(row.conversionType, currentConversionStats)
            }

            const byConversion: AggregatedClientConversionStats[] = [...byConversionStats.entries()]
                .map(([conversionType, stats]) => ({
                    conversionType,
                    total: stats.total,
                    reserved: stats.reserved,
                    paymentRequired: stats.paymentRequired,
                    pendingPayment: stats.pendingPayment,
                    ready: stats.ready,
                    completed: stats.completed,
                    failed: stats.failed,
                    expired: stats.expired,
                    paid: stats.paid,
                    avgDurationMs: stats.durations.length > 0
                        ? Math.round(stats.durations.reduce((sum, duration) => sum + duration, 0) / stats.durations.length)
                        : 0,
                    p95DurationMs: calculatePercentile(stats.durations, 0.95),
                }))
                .sort((left, right) => left.conversionType.localeCompare(right.conversionType))

            return {
                ...totals,
                avgDurationMs: durations.length > 0
                    ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length)
                    : 0,
                p50DurationMs: calculatePercentile(durations, 0.5),
                p95DurationMs: calculatePercentile(durations, 0.95),
                byConversion,
            }
        })(),

        // Event stats (last 1hr)
        (async () => {
            const rows = await db
                .select({
                    total: sql<number>`count(*)`,
                    statusChanges: sql<number>`sum(case when ${conversionEvents.eventType} = 'conversion_status_changed' then 1 else 0 end)`,
                    paymentCompleted: sql<number>`sum(case when ${conversionEvents.eventType} = 'payment_status_changed' and ${conversionEvents.paymentStatus} = 'completed' then 1 else 0 end)`,
                    artifactMissing: sql<number>`sum(case when ${conversionEvents.eventType} = 'conversion_status_changed' and ${conversionEvents.fromStatus} = 'completed' and ${conversionEvents.toStatus} = 'failed' then 1 else 0 end)`,
                })
                .from(conversionEvents)
                .where(sql`${conversionEvents.createdAt} >= ${oneHourAgo}`)

            const row = rows[0]
            if (!row) {
                return {
                    total: 0,
                    statusChanges: 0,
                    paymentCompleted: 0,
                    artifactMissing: 0,
                }
            }

            return {
                total: row.total ?? 0,
                statusChanges: row.statusChanges ?? 0,
                paymentCompleted: row.paymentCompleted ?? 0,
                artifactMissing: row.artifactMissing ?? 0,
            }
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

    // Converter registration check
    let converterCheck: { status: string; requiredTools: string[]; missingTools: string[]; coverage: string } = {
        status: "ok",
        requiredTools: [],
        missingTools: [],
        coverage: "registered",
    }
    try {
        registerAllConvertersModule.registerAllConverters()
        const requiredTools = [...new Set(conversionsModule.getServerConversions().map(c => c.toolName))]
        const missingTools = requiredTools.filter(t => !convertersModule.getConverter(t))
        converterCheck = {
            status: missingTools.length > 0 ? "down" : "ok",
            requiredTools,
            missingTools,
            coverage: missingTools.length > 0 ? "incomplete" : "registered",
        }
        if (missingTools.length > 0) {
            requestLogger.error({ missingTools }, "Converter check failed")
        }
    } catch (error) {
        requestLogger.error({ err: error }, "Converter registration failed during metrics check")
        converterCheck = {
            status: "down",
            requiredTools: [],
            missingTools: ["registration_failed"],
            coverage: "registration_failed",
        }
    }

    return Response.json(
        {
            disk: diskStats,
            queue: queueStats,
            converters: converterCheck,
            conversions: {
                last1h: conversionStats,
                lastSuccessfulAt: lastSuccess,
            },
            clientConversions: {
                last1h: clientConversionStats,
            },
            events: {
                last1h: eventStats,
            },
            requestRateLimit: {
                activeBuckets: getRequestRateLimitBucketCount(),
            },
            system: {
                uptime: Math.floor(process.uptime()),
                timestamp: new Date().toISOString(),
            },
        },
        {
            status: 200,
            headers: responseHeaders,
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
