import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'

vi.mock('~/lib/server-runtime', () => ({
  initializeServerRuntime: vi.fn(),
}))

type DbType = Awaited<ReturnType<typeof setupTestDb>>['db']
type SchemaType = Awaited<ReturnType<typeof setupTestDb>>['schema']

describe('processClientConversionFail', () => {
  let db: DbType
  let schema: SchemaType

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    const sandbox = createTestSandbox()
    const setup = await setupTestDb(sandbox)
    db = setup.db
    schema = setup.schema
  })

  it('records a failed free attempt and releases the reserved slot once', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const token = 'client-fail-free-token'
    const { hashClientAttemptToken } = await import('~/lib/client-conversion-attempts')
    const { processClientConversionFail } = await import('~/server/api/client-conversion-fail')

    await db.insert(schema.rateLimits).values({
      ipAddress: '127.0.0.1',
      date: today,
      freeConversionCount: 0,
      reservedFreeSlots: 1,
    })

    await db.insert(schema.clientConversionAttempts).values({
      id: 'attempt-fail-free',
      conversionType: 'png-to-jpg',
      category: 'image',
      ipAddress: '127.0.0.1',
      inputMode: 'file',
      tokenHash: hashClientAttemptToken(token),
      rateLimitDate: today,
      status: 'reserved',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    })

    const result = await processClientConversionFail({
      attemptId: 'attempt-fail-free',
      token,
      errorCode: 'conversion_failed',
      errorMessage: 'Canvas conversion failed.',
    }, '127.0.0.1')

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ released: true })

    const attempt = await db.query.clientConversionAttempts.findFirst({
      where: eq(schema.clientConversionAttempts.id, 'attempt-fail-free'),
    })
    expect(attempt).toMatchObject({
      status: 'failed',
      errorCode: 'conversion_failed',
      errorMessage: 'Canvas conversion failed.',
      recoveryToken: null,
    })
    expect(attempt?.completedAt).toBeTruthy()

    const rateLimit = await db.query.rateLimits.findFirst({
      where: and(
        eq(schema.rateLimits.ipAddress, '127.0.0.1'),
        eq(schema.rateLimits.date, today),
      ),
    })
    expect(rateLimit).toMatchObject({
      freeConversionCount: 0,
      reservedFreeSlots: 0,
    })

    const repeatResult = await processClientConversionFail({
      attemptId: 'attempt-fail-free',
      token,
      errorCode: 'conversion_failed',
    }, '127.0.0.1')

    expect(repeatResult.status).toBe(200)
    expect(repeatResult.body).toEqual({ released: true })
  })

  it('rejects invalid client conversion tokens', async () => {
    const { hashClientAttemptToken } = await import('~/lib/client-conversion-attempts')
    const { processClientConversionFail } = await import('~/server/api/client-conversion-fail')

    await db.insert(schema.clientConversionAttempts).values({
      id: 'attempt-fail-bad-token',
      conversionType: 'png-to-jpg',
      category: 'image',
      ipAddress: '127.0.0.1',
      inputMode: 'file',
      tokenHash: hashClientAttemptToken('valid-token'),
      status: 'reserved',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    })

    const result = await processClientConversionFail({
      attemptId: 'attempt-fail-bad-token',
      token: 'invalid-token',
      errorCode: 'conversion_failed',
    }, '127.0.0.1')

    expect(result.status).toBe(403)
    expect(result.body).toMatchObject({
      error: 'invalid_token',
    })
  })

  it('clears leftover recovery tokens for paid ready attempts without touching rate limits', async () => {
    const token = 'client-fail-paid-token'
    const { hashClientAttemptToken } = await import('~/lib/client-conversion-attempts')
    const { processClientConversionFail } = await import('~/server/api/client-conversion-fail')

    await db.insert(schema.clientConversionAttempts).values({
      id: 'attempt-fail-paid',
      conversionType: 'png-to-jpg',
      category: 'image',
      ipAddress: '127.0.0.1',
      inputMode: 'file',
      tokenHash: hashClientAttemptToken(token),
      recoveryToken: 'leftover-recovery-token',
      wasPaid: 1,
      status: 'ready',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    })

    const result = await processClientConversionFail({
      attemptId: 'attempt-fail-paid',
      token,
      errorCode: 'conversion_failed',
      errorMessage: 'Client conversion failed after payment.',
    }, '127.0.0.1')

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ released: true })

    const attempt = await db.query.clientConversionAttempts.findFirst({
      where: eq(schema.clientConversionAttempts.id, 'attempt-fail-paid'),
    })
    expect(attempt).toMatchObject({
      status: 'failed',
      errorCode: 'conversion_failed',
      errorMessage: 'Client conversion failed after payment.',
      recoveryToken: null,
      wasPaid: 1,
    })
  })

  it('returns attempt_expired once cleanup has already expired the attempt', async () => {
    const token = 'client-fail-expired-token'
    const { hashClientAttemptToken } = await import('~/lib/client-conversion-attempts')
    const { processClientConversionFail } = await import('~/server/api/client-conversion-fail')

    await db.insert(schema.clientConversionAttempts).values({
      id: 'attempt-fail-expired',
      conversionType: 'png-to-jpg',
      category: 'image',
      ipAddress: '127.0.0.1',
      inputMode: 'file',
      tokenHash: hashClientAttemptToken(token),
      status: 'expired',
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    })

    const result = await processClientConversionFail({
      attemptId: 'attempt-fail-expired',
      token,
      errorCode: 'conversion_failed',
    }, '127.0.0.1')

    expect(result.status).toBe(410)
    expect(result.body).toMatchObject({
      error: 'attempt_expired',
      status: 'expired',
    })
  })
})
