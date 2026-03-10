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
  queue: { activeJobs: number; queuedJobs: number; maxConcurrent: number }
  conversions: {
    last1h: { total: number; successful: number; failed: number; timeout: number; successRate: number; avgDurationMs: number }
    lastSuccessfulAt: string | null
  }
  requestRateLimit: { activeBuckets: number }
  system: { uptime: number; timestamp: string }
}

let db: DB
let schema: { conversions: typeof SchemaModule.conversions }
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
    expect(body).toHaveProperty('queue')
    expect(body).toHaveProperty('conversions')
    expect(body).toHaveProperty('requestRateLimit')
    expect(body).toHaveProperty('system')
    expect(body.disk).toHaveProperty('available')
    expect(body.disk).toHaveProperty('errorCode')
    expect(body.disk).toHaveProperty('filesystemStatsAvailable')
    expect(body.disk).toHaveProperty('usedBytes')
    expect(body.disk).toHaveProperty('fileCount')
    expect(body.queue).toHaveProperty('activeJobs')
    expect(body.queue).toHaveProperty('queuedJobs')
    expect(body.queue).toHaveProperty('maxConcurrent')
    expect(body.conversions).toHaveProperty('last1h')
    expect(body.conversions).toHaveProperty('lastSuccessfulAt')
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
  })

  it('returns correct success rate and avgDurationMs from seeded data', async () => {
    const now = new Date().toISOString()
    await seed({ status: 'completed', conversionCompletedAt: now, conversionTimeMs: 100 })
    await seed({ status: 'completed', conversionCompletedAt: now, conversionTimeMs: 200 })
    await seed({ status: 'failed', conversionCompletedAt: now, conversionTimeMs: 50 })

    const resp = await handleMetricsRequest(makeRequest({ Authorization: 'Bearer test-secret-key' }))
    const body = await resp.json() as MetricsResponse

    expect(body.conversions.last1h.total).toBe(3)
    expect(body.conversions.last1h.successful).toBe(2)
    expect(body.conversions.last1h.failed).toBe(1)
    expect(body.conversions.last1h.successRate).toBe(67)
    expect(body.conversions.last1h.avgDurationMs).toBeGreaterThan(0)
  })

  it('handles zero-conversions edge: successRate=100, avgDurationMs=0, lastSuccessfulAt=null', async () => {
    const resp = await handleMetricsRequest(makeRequest({ Authorization: 'Bearer test-secret-key' }))
    const body = await resp.json() as MetricsResponse

    expect(body.conversions.last1h.total).toBe(0)
    expect(body.conversions.last1h.successRate).toBe(100)
    expect(body.conversions.last1h.avgDurationMs).toBe(0)
    expect(body.conversions.lastSuccessfulAt).toBeNull()
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
