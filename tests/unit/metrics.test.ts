import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'

import type * as SchemaModule from '~/lib/db/schema'
import type * as MetricsModule from '~/routes/api/metrics'

type DB = Awaited<ReturnType<typeof setupTestDb>>['db']

interface MetricsResponse {
  disk: {
    available: boolean
    errorCode: string | null
    filesystemStatsAvailable: boolean
    usedBytes: number
    totalBytes: number
    usedPercent: number
    fileCount: number
  }
  converters: {
    status: string
    requiredTools: string[]
    missingTools: string[]
    coverage: string
  }
  queue: {
    activeJobs: number
    queuedJobs: number
    maxConcurrent: number
    availableSlots: number
    oldestQueuedAgeMs: number | null
    oldestConvertingAgeMs: number | null
    stalledJobs: number
  }
  conversions: {
    last1h: {
      total: number
      successful: number
      failed: number
      timeout: number
      successRate: number
      avgDurationMs: number
      p50DurationMs: number
      p95DurationMs: number
      byTool: Array<{
        toolName: string
        total: number
        successful: number
        failed: number
        timeout: number
        successRate: number
        avgDurationMs: number
        p95DurationMs: number
      }>
    }
    lastSuccessfulAt: string | null
  }
  events: {
    last1h: {
      total: number
      statusChanges: number
      paymentCompleted: number
      artifactMissing: number
    }
  }
  requestRateLimit: { activeBuckets: number }
  system: { uptime: number; timestamp: string }
}

let db: DB
let schema: { conversions: typeof SchemaModule.conversions; conversionEvents: typeof SchemaModule.conversionEvents }
let handleMetricsRequest: typeof MetricsModule.handleMetricsRequest

async function seed(overrides: Record<string, unknown> = {}) {
  const id = randomUUID()
  await db.insert(schema.conversions).values({
    id,
    originalFilename: 'test.docx',
    sourceFormat: 'docx',
    targetFormat: 'markdown',
    conversionType: 'docx-to-markdown',
    ipAddress: '127.0.0.1',
    inputFilePath: `${id}.docx`,
    wasPaid: 0,
    status: 'uploaded',
    ...overrides,
  } as Parameters<typeof db.insert>[0] extends { values: (v: infer V) => unknown } ? V : never)
  return id
}

beforeEach(async () => {
  vi.resetModules()

  const sandbox = createTestSandbox()
  const { db: testDb, schema: testSchema } = await setupTestDb(sandbox)
  db = testDb
  schema = testSchema as typeof schema

  process.env.METRICS_API_KEY = 'test-secret-key'

  const metricsMod = await import('~/routes/api/metrics')
  handleMetricsRequest = metricsMod.handleMetricsRequest
})

afterEach(() => {
  vi.useRealTimers()
})

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/metrics', { headers })
}

describe('handleMetricsRequest', () => {
  it('returns 401 on missing auth header', async () => {
    const resp = await handleMetricsRequest(makeRequest())
    expect(resp.status).toBe(401)
  })

  it('returns 401 on wrong auth token', async () => {
    const resp = await handleMetricsRequest(makeRequest({ Authorization: 'Bearer wrong-key' }))
    expect(resp.status).toBe(401)
  })

  it('returns 401 on malformed auth header', async () => {
    const resp = await handleMetricsRequest(makeRequest({ Authorization: 'Basic abc123' }))
    expect(resp.status).toBe(401)
  })

  it('returns 401 on empty Bearer token', async () => {
    const resp = await handleMetricsRequest(makeRequest({ Authorization: 'Bearer ' }))
    expect(resp.status).toBe(401)
  })

  it('returns 503 when METRICS_API_KEY not configured', async () => {
    delete process.env.METRICS_API_KEY

    vi.resetModules()
    const mod = await import('~/routes/api/metrics')

    const resp = await mod.handleMetricsRequest(makeRequest({ Authorization: 'Bearer anything' }))
    expect(resp.status).toBe(503)
  })

  it('returns 200 with correct response shape when authenticated', async () => {
    const resp = await handleMetricsRequest(makeRequest({ Authorization: 'Bearer test-secret-key' }))
    expect(resp.status).toBe(200)

    const body = await resp.json() as MetricsResponse
    expect(body).toHaveProperty('disk')
    expect(body).toHaveProperty('converters')
    expect(body).toHaveProperty('queue')
    expect(body).toHaveProperty('conversions')
    expect(body).toHaveProperty('events')
    expect(body).toHaveProperty('requestRateLimit')
    expect(body).toHaveProperty('system')
    expect(body.disk).toHaveProperty('available')
    expect(body.disk).toHaveProperty('errorCode')
    expect(body.disk).toHaveProperty('filesystemStatsAvailable')
    expect(body.disk).toHaveProperty('usedBytes')
    expect(body.disk).toHaveProperty('fileCount')
    expect(body.converters).toHaveProperty('status')
    expect(body.converters).toHaveProperty('requiredTools')
    expect(body.converters).toHaveProperty('missingTools')
    expect(body.converters).toHaveProperty('coverage')
    expect(body.converters.requiredTools).toContain('pandoc')
    expect(body.converters.missingTools).toEqual([])
    expect(body.converters.coverage).toBe('registered')
    expect(body.queue).toHaveProperty('activeJobs')
    expect(body.queue).toHaveProperty('queuedJobs')
    expect(body.queue).toHaveProperty('maxConcurrent')
    expect(body.queue).toHaveProperty('availableSlots')
    expect(body.queue).toHaveProperty('oldestQueuedAgeMs')
    expect(body.queue).toHaveProperty('oldestConvertingAgeMs')
    expect(body.queue).toHaveProperty('stalledJobs')
    expect(body.conversions).toHaveProperty('last1h')
    expect(body.conversions).toHaveProperty('lastSuccessfulAt')
    expect(body.conversions.last1h).toHaveProperty('p50DurationMs')
    expect(body.conversions.last1h).toHaveProperty('p95DurationMs')
    expect(body.conversions.last1h).toHaveProperty('byTool')
    expect(body.events).toHaveProperty('last1h')
    expect(body.requestRateLimit).toHaveProperty('activeBuckets')
    expect(body.system).toHaveProperty('uptime')
    expect(body.system).toHaveProperty('timestamp')
  })

  it('returns correct queue counts from seeded DB rows', async () => {
    await seed({ status: 'converting' })
    await seed({ status: 'converting' })
    await seed({ status: 'queued' })

    const resp = await handleMetricsRequest(makeRequest({ Authorization: 'Bearer test-secret-key' }))
    const body = await resp.json() as MetricsResponse

    expect(body.queue.activeJobs).toBe(2)
    expect(body.queue.queuedJobs).toBe(1)
    expect(body.queue.availableSlots).toBe(3)
  })

  it('returns queue age and stall metrics', async () => {
    await seed({ status: 'queued', createdAt: new Date(Date.now() - 90_000).toISOString() })
    await seed({ status: 'converting', conversionStartedAt: new Date(Date.now() - 45_000).toISOString() })

    const resp = await handleMetricsRequest(makeRequest({ Authorization: 'Bearer test-secret-key' }))
    const body = await resp.json() as MetricsResponse

    expect(body.queue.oldestQueuedAgeMs).not.toBeNull()
    expect(body.queue.oldestConvertingAgeMs).not.toBeNull()
    expect(body.queue.oldestQueuedAgeMs!).toBeGreaterThanOrEqual(80_000)
    expect(body.queue.oldestConvertingAgeMs!).toBeGreaterThanOrEqual(40_000)
    expect(body.queue.stalledJobs).toBe(1)
  })

  it('returns correct success rate, percentile durations, and per-tool stats from seeded data', async () => {
    const now = new Date().toISOString()
    await seed({ status: 'completed', toolName: 'pandoc', conversionCompletedAt: now, conversionTimeMs: 100 })
    await seed({ status: 'completed', toolName: 'pandoc', conversionCompletedAt: now, conversionTimeMs: 200 })
    await seed({ status: 'failed', toolName: 'weasyprint', conversionCompletedAt: now, conversionTimeMs: 50 })

    const resp = await handleMetricsRequest(makeRequest({ Authorization: 'Bearer test-secret-key' }))
    const body = await resp.json() as MetricsResponse

    expect(body.conversions.last1h.total).toBe(3)
    expect(body.conversions.last1h.successful).toBe(2)
    expect(body.conversions.last1h.failed).toBe(1)
    expect(body.conversions.last1h.successRate).toBe(67)
    expect(body.conversions.last1h.avgDurationMs).toBe(117)
    expect(body.conversions.last1h.p50DurationMs).toBe(100)
    expect(body.conversions.last1h.p95DurationMs).toBe(200)
    expect(body.conversions.last1h.byTool).toEqual([
      {
        toolName: 'pandoc',
        total: 2,
        successful: 2,
        failed: 0,
        timeout: 0,
        successRate: 100,
        avgDurationMs: 150,
        p95DurationMs: 200,
      },
      {
        toolName: 'weasyprint',
        total: 1,
        successful: 0,
        failed: 1,
        timeout: 0,
        successRate: 0,
        avgDurationMs: 50,
        p95DurationMs: 50,
      },
    ])
  })

  it('handles zero-conversions edge: successRate=100, avgDurationMs=0, lastSuccessfulAt=null', async () => {
    const resp = await handleMetricsRequest(makeRequest({ Authorization: 'Bearer test-secret-key' }))
    const body = await resp.json() as MetricsResponse

    expect(body.conversions.last1h.total).toBe(0)
    expect(body.conversions.last1h.successRate).toBe(100)
    expect(body.conversions.last1h.avgDurationMs).toBe(0)
    expect(body.conversions.last1h.p50DurationMs).toBe(0)
    expect(body.conversions.last1h.p95DurationMs).toBe(0)
    expect(body.conversions.last1h.byTool).toEqual([])
    expect(body.conversions.lastSuccessfulAt).toBeNull()
    expect(body.events.last1h.total).toBe(0)
  })

  it('includes Cache-Control: no-store header', async () => {
    const resp = await handleMetricsRequest(makeRequest({ Authorization: 'Bearer test-secret-key' }))
    expect(resp.headers.get('Cache-Control')).toBe('no-store')
    expect(resp.headers.get('x-request-id')).toBeTruthy()
  })

  it('returns lastSuccessfulAt from all-time, not just last hour', async () => {
    // Seed a completed conversion from 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    await seed({ status: 'completed', conversionCompletedAt: twoHoursAgo, conversionTimeMs: 50 })

    const resp = await handleMetricsRequest(makeRequest({ Authorization: 'Bearer test-secret-key' }))
    const body = await resp.json() as MetricsResponse

    // Should NOT appear in last1h stats
    expect(body.conversions.last1h.total).toBe(0)
    // But should appear in lastSuccessfulAt
    expect(body.conversions.lastSuccessfulAt).toBe(twoHoursAgo)
  })

  it('includes event counts for recent observability history', async () => {
    const now = new Date().toISOString()
    await db.insert(schema.conversionEvents).values([
      {
        fileId: 'file-1',
        eventType: 'conversion_status_changed',
        fromStatus: 'queued',
        toStatus: 'completed',
        message: 'Conversion completed.',
        createdAt: now,
      },
      {
        fileId: 'file-2',
        eventType: 'conversion_status_changed',
        fromStatus: 'completed',
        toStatus: 'failed',
        message: 'The converted file is no longer available. Please convert the file again.',
        createdAt: now,
      },
      {
        fileId: 'file-3',
        eventType: 'payment_status_changed',
        paymentStatus: 'completed',
        message: 'Payment status changed.',
        createdAt: now,
      },
    ])

    const resp = await handleMetricsRequest(makeRequest({ Authorization: 'Bearer test-secret-key' }))
    const body = await resp.json() as MetricsResponse

    expect(body.events.last1h.total).toBe(3)
    expect(body.events.last1h.statusChanges).toBe(2)
    expect(body.events.last1h.paymentCompleted).toBe(1)
    expect(body.events.last1h.artifactMissing).toBe(1)
  })

  it('surfaces disk metric collection failures explicitly', async () => {
    const { CONVERSIONS_DIR } = await import('~/lib/conversion-files')
    await fs.rm(CONVERSIONS_DIR, { recursive: true, force: true })

    const resp = await handleMetricsRequest(makeRequest({ Authorization: 'Bearer test-secret-key' }))
    const body = await resp.json() as MetricsResponse

    expect(body.disk.available).toBe(false)
    expect(body.disk.errorCode).toBe('conversions_dir_unavailable')
    expect(body.disk.filesystemStatsAvailable).toBe(false)
  })
})
