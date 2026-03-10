import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'

import type * as ReadinessModule from '~/routes/api/health/ready'

interface ReadinessOkResponse {
  status: string
  uptime: number
  timestamp: string
  dbLatencyMs: number
}

interface ReadinessDegradedResponse {
  status: string
  uptime: number
  timestamp: string
  error?: unknown
  dbLatencyMs?: unknown
}

let handleReadinessRequest: typeof ReadinessModule.handleReadinessRequest

beforeEach(async () => {
  vi.resetModules()

  const sandbox = createTestSandbox()
  await setupTestDb(sandbox)

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
  })

  it('includes Cache-Control: no-store header', async () => {
    const resp = await handleReadinessRequest()
    expect(resp.headers.get('Cache-Control')).toBe('no-store')
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
    // Must NOT expose raw error details
    expect(body).not.toHaveProperty('error')
    expect(body).not.toHaveProperty('dbLatencyMs')
  })
})
