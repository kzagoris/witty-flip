import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'

import type * as ReadinessModule from '~/routes/api/health/ready'

interface ReadinessOkResponse {
  status: string
  uptime: number
  timestamp: string
  dbLatencyMs: number
  checks: {
    database: {
      status: string
      latencyMs: number
    }
    storage: {
      status: string
      path: string
      writable: boolean
    }
    converters: {
      status: string
      requiredTools: string[]
      missingTools: string[]
      coverage: string
    }
  }
}

interface ReadinessDegradedResponse {
  status: string
  uptime: number
  timestamp: string
  checks: {
    database: {
      status: string
      errorCode: string
    }
    storage: {
      status: string
      path: string
      writable?: boolean
      errorCode?: string
    }
    converters: {
      status: string
      requiredTools: string[]
      missingTools: string[]
      coverage: string
    }
  }
}

let handleReadinessRequest: typeof ReadinessModule.handleReadinessRequest

beforeEach(async () => {
  vi.resetModules()

  const sandbox = createTestSandbox()
  await setupTestDb(sandbox)
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret'
  process.env.METRICS_API_KEY = 'test-metrics-key'
  process.env.BASE_URL = 'http://localhost:3000'

  const mod = await import('~/routes/api/health/ready')
  handleReadinessRequest = mod.handleReadinessRequest
})

describe('handleReadinessRequest', () => {
  it('returns 200 with uptime/timestamp/dbLatencyMs when DB is accessible', async () => {
    const resp = await handleReadinessRequest()
    expect(resp.status).toBe(200)

    const body = await resp.json() as ReadinessOkResponse
    expect(body.status).toBe('ok')
    expect(typeof body.uptime).toBe('number')
    expect(typeof body.timestamp).toBe('string')
    expect(typeof body.dbLatencyMs).toBe('number')
    expect(body.dbLatencyMs).toBeGreaterThanOrEqual(0)
    expect(body.checks.database.status).toBe('ok')
    expect(body.checks.database.latencyMs).toBe(body.dbLatencyMs)
    expect(body.checks.storage.status).toBe('ok')
    expect(body.checks.storage.writable).toBe(true)
    expect(body.checks.storage.path).toContain('data')
    expect(body.checks.converters.status).toBe('ok')
    expect(body.checks.converters.requiredTools).toContain('pandoc')
    expect(body.checks.converters.missingTools).toEqual([])
    expect(body.checks.converters.coverage).toBe('registered')
  })

  it('includes Cache-Control: no-store header', async () => {
    const resp = await handleReadinessRequest()
    expect(resp.headers.get('Cache-Control')).toBe('no-store')
    expect(resp.headers.get('x-request-id')).toBeTruthy()
  })

  it('returns 503 with no raw DB error details when DB query fails', async () => {
    vi.resetModules()

    // Set DATABASE_URL to an invalid path
    process.env.DATABASE_URL = 'file:/nonexistent/path/to/db.sqlite'

    const mod = await import('~/routes/api/health/ready')
    const resp = await mod.handleReadinessRequest()

    expect(resp.status).toBe(503)
    const body = await resp.json() as ReadinessDegradedResponse
    expect(body.status).toBe('degraded')
    expect(typeof body.uptime).toBe('number')
    expect(typeof body.timestamp).toBe('string')
    expect(body.checks.database.status).toBe('down')
    expect(body.checks.database.errorCode).toBe('database_unavailable')
    expect(body.checks.storage.status).toBe('ok')
    expect(body.checks.converters.status).toBe('ok')
    expect(body).not.toHaveProperty('dbLatencyMs')
  })
})
