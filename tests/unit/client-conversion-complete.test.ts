import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'

vi.mock('~/lib/server-runtime', () => ({
  initializeServerRuntime: vi.fn(),
}))

type DbType = Awaited<ReturnType<typeof setupTestDb>>['db']
type SchemaType = Awaited<ReturnType<typeof setupTestDb>>['schema']

describe('processClientConversionComplete', () => {
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

  it('records a completed free client conversion and consumes the reserved slot once', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const token = 'client-complete-free-token'
    const { hashClientAttemptToken } = await import('~/lib/client-conversion-attempts')
    const { processClientConversionComplete } = await import('~/server/api/client-conversion-complete')

    await db.insert(schema.rateLimits).values({
      ipAddress: '127.0.0.1',
      date: today,
      freeConversionCount: 0,
      reservedFreeSlots: 1,
    })

    await db.insert(schema.clientConversionAttempts).values({
      id: 'attempt-complete-free',
      conversionType: 'png-to-jpg',
      category: 'image',
      ipAddress: '127.0.0.1',
      inputMode: 'file',
      tokenHash: hashClientAttemptToken(token),
      rateLimitDate: today,
      status: 'reserved',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    })

    const result = await processClientConversionComplete({
      attemptId: 'attempt-complete-free',
      token,
      outputFilename: 'output.jpg',
      outputMimeType: 'image/jpeg',
      outputSizeBytes: 2048,
      durationMs: 42,
    }, '127.0.0.1')

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ recorded: true })

    const attempt = await db.query.clientConversionAttempts.findFirst({
      where: eq(schema.clientConversionAttempts.id, 'attempt-complete-free'),
    })
    expect(attempt).toMatchObject({
      status: 'completed',
      outputFilename: 'output.jpg',
      outputMimeType: 'image/jpeg',
      outputSizeBytes: 2048,
      durationMs: 42,
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
      freeConversionCount: 1,
      reservedFreeSlots: 0,
    })

    const repeatResult = await processClientConversionComplete({
      attemptId: 'attempt-complete-free',
      token,
      outputFilename: 'output.jpg',
      outputMimeType: 'image/jpeg',
    }, '127.0.0.1')

    expect(repeatResult.status).toBe(200)
    expect(repeatResult.body).toEqual({ recorded: true })

    const rateLimitAfterRepeat = await db.query.rateLimits.findFirst({
      where: and(
        eq(schema.rateLimits.ipAddress, '127.0.0.1'),
        eq(schema.rateLimits.date, today),
      ),
    })
    expect(rateLimitAfterRepeat).toMatchObject({
      freeConversionCount: 1,
      reservedFreeSlots: 0,
    })
  })

  it('rejects invalid client conversion tokens', async () => {
    const { hashClientAttemptToken } = await import('~/lib/client-conversion-attempts')
    const { processClientConversionComplete } = await import('~/server/api/client-conversion-complete')

    await db.insert(schema.clientConversionAttempts).values({
      id: 'attempt-complete-bad-token',
      conversionType: 'png-to-jpg',
      category: 'image',
      ipAddress: '127.0.0.1',
      inputMode: 'file',
      tokenHash: hashClientAttemptToken('valid-token'),
      status: 'reserved',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    })

    const result = await processClientConversionComplete({
      attemptId: 'attempt-complete-bad-token',
      token: 'invalid-token',
      outputFilename: 'output.jpg',
      outputMimeType: 'image/jpeg',
    }, '127.0.0.1')

    expect(result.status).toBe(403)
    expect(result.body).toMatchObject({
      error: 'invalid_token',
    })
  })

  it('rejects expired attempts before recording completion analytics', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const token = 'client-complete-expired-token'
    const { hashClientAttemptToken } = await import('~/lib/client-conversion-attempts')
    const { processClientConversionComplete } = await import('~/server/api/client-conversion-complete')

    await db.insert(schema.rateLimits).values({
      ipAddress: '127.0.0.1',
      date: today,
      freeConversionCount: 0,
      reservedFreeSlots: 1,
    })

    await db.insert(schema.clientConversionAttempts).values({
      id: 'attempt-complete-expired',
      conversionType: 'png-to-jpg',
      category: 'image',
      ipAddress: '127.0.0.1',
      inputMode: 'file',
      tokenHash: hashClientAttemptToken(token),
      rateLimitDate: today,
      status: 'reserved',
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    })

    const result = await processClientConversionComplete({
      attemptId: 'attempt-complete-expired',
      token,
      outputFilename: 'output.jpg',
      outputMimeType: 'image/jpeg',
    }, '127.0.0.1')

    expect(result.status).toBe(410)
    expect(result.body).toMatchObject({
      error: 'attempt_expired',
      status: 'expired',
    })

    const rateLimit = await db.query.rateLimits.findFirst({
      where: and(
        eq(schema.rateLimits.ipAddress, '127.0.0.1'),
        eq(schema.rateLimits.date, today),
      ),
    })
    expect(rateLimit).toMatchObject({
      freeConversionCount: 0,
      reservedFreeSlots: 1,
    })
  })

  it('records paid ready attempts without touching rate limits and clears any leftover recovery token', async () => {
    const token = 'client-complete-paid-token'
    const { hashClientAttemptToken } = await import('~/lib/client-conversion-attempts')
    const { processClientConversionComplete } = await import('~/server/api/client-conversion-complete')

    await db.insert(schema.clientConversionAttempts).values({
      id: 'attempt-complete-paid',
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

    const result = await processClientConversionComplete({
      attemptId: 'attempt-complete-paid',
      token,
      outputFilename: 'output.jpg',
      outputMimeType: 'image/jpeg',
    }, '127.0.0.1')

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ recorded: true })

    const attempt = await db.query.clientConversionAttempts.findFirst({
      where: eq(schema.clientConversionAttempts.id, 'attempt-complete-paid'),
    })
    expect(attempt).toMatchObject({
      status: 'completed',
      recoveryToken: null,
      wasPaid: 1,
    })
  })

  it('rejects completion when attempt is in a non-completable status', async () => {
    const token = 'client-complete-wrong-status-token'
    const { hashClientAttemptToken } = await import('~/lib/client-conversion-attempts')
    const { processClientConversionComplete } = await import('~/server/api/client-conversion-complete')

    await db.insert(schema.clientConversionAttempts).values({
      id: 'attempt-wrong-status',
      conversionType: 'png-to-jpg',
      category: 'image',
      ipAddress: '127.0.0.1',
      inputMode: 'file',
      tokenHash: hashClientAttemptToken(token),
      status: 'failed',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    })

    const result = await processClientConversionComplete({
      attemptId: 'attempt-wrong-status',
      token,
      outputFilename: 'output.jpg',
      outputMimeType: 'image/jpeg',
    }, '127.0.0.1')

    expect(result.status).toBe(409)
    expect(result.body).toMatchObject({ error: 'invalid_status' })
  })
})
