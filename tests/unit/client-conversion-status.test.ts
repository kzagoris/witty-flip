import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'

const { mockReconcileClientPendingPayment } = vi.hoisted(() => ({
  mockReconcileClientPendingPayment: vi.fn(),
}))

vi.mock('~/lib/stripe', () => ({
  reconcileClientPendingPayment: mockReconcileClientPendingPayment,
}))

vi.mock('~/lib/server-runtime', () => ({
  initializeServerRuntime: vi.fn(),
}))

type DbType = Awaited<ReturnType<typeof setupTestDb>>['db']
type SchemaType = Awaited<ReturnType<typeof setupTestDb>>['schema']

describe('processClientConversionStatus', () => {
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

  it('returns a one-time recovery token and clears it when the requesting IP matches', async () => {
    const { hashClientAttemptToken } = await import('~/lib/client-conversion-attempts')
    const { processClientConversionStatus } = await import('~/server/api/client-conversion-status')
    const attemptId = 'attempt-ready-ip'
    const recoveryToken = 'recovery-token-ip'

    await db.insert(schema.clientConversionAttempts).values({
      id: attemptId,
      conversionType: 'png-to-jpg',
      category: 'image',
      ipAddress: '127.0.0.1',
      inputMode: 'file',
      tokenHash: hashClientAttemptToken(recoveryToken),
      recoveryToken,
      status: 'ready',
      wasPaid: 1,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    })

    const firstResult = await processClientConversionStatus({ attemptId }, '127.0.0.1')
    expect(firstResult.status).toBe(200)
    expect(firstResult.body).toMatchObject({
      attemptId,
      status: 'ready',
      paid: true,
      token: recoveryToken,
    })

    const afterFirstRead = await db.query.clientConversionAttempts.findFirst({
      where: eq(schema.clientConversionAttempts.id, attemptId),
    })
    expect(afterFirstRead?.recoveryToken).toBeNull()

    const secondResult = await processClientConversionStatus({ attemptId }, '127.0.0.1')
    expect(secondResult.status).toBe(200)
    expect(secondResult.body).toMatchObject({
      attemptId,
      status: 'ready',
      paid: true,
    })
    expect('token' in secondResult.body).toBe(false)
  })

  it('falls back to the signed recovery cookie when the IP does not match', async () => {
    const {
      getClientAttemptRecoveryCookieName,
      hashClientAttemptToken,
      signClientAttemptRecoveryCookie,
    } = await import('~/lib/client-conversion-attempts')
    const { processClientConversionStatus } = await import('~/server/api/client-conversion-status')
    const attemptId = 'attempt-ready-cookie'
    const recoveryToken = 'recovery-token-cookie'

    await db.insert(schema.clientConversionAttempts).values({
      id: attemptId,
      conversionType: 'png-to-jpg',
      category: 'image',
      ipAddress: '127.0.0.1',
      inputMode: 'file',
      tokenHash: hashClientAttemptToken(recoveryToken),
      recoveryToken,
      status: 'ready',
      wasPaid: 1,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    })

    const cookie = `${getClientAttemptRecoveryCookieName(attemptId)}=${signClientAttemptRecoveryCookie(attemptId)}`
    const result = await processClientConversionStatus(
      { attemptId },
      '203.0.113.44',
      { cookieHeader: cookie },
    )

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      attemptId,
      status: 'ready',
      token: recoveryToken,
    })
  })

  it('does not return the recovery token when ownership cannot be proven', async () => {
    const { hashClientAttemptToken } = await import('~/lib/client-conversion-attempts')
    const { processClientConversionStatus } = await import('~/server/api/client-conversion-status')
    const attemptId = 'attempt-ready-no-cookie'
    const recoveryToken = 'recovery-token-no-cookie'

    await db.insert(schema.clientConversionAttempts).values({
      id: attemptId,
      conversionType: 'png-to-jpg',
      category: 'image',
      ipAddress: '127.0.0.1',
      inputMode: 'file',
      tokenHash: hashClientAttemptToken(recoveryToken),
      recoveryToken,
      status: 'ready',
      wasPaid: 1,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    })

    const result = await processClientConversionStatus({ attemptId }, '203.0.113.44')

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      attemptId,
      status: 'ready',
      paid: true,
    })
    expect('token' in result.body).toBe(false)

    const attempt = await db.query.clientConversionAttempts.findFirst({
      where: eq(schema.clientConversionAttempts.id, attemptId),
    })
    expect(attempt?.recoveryToken).toBe(recoveryToken)
  })

  it('re-reads the attempt after payment reconciliation updates a pending payment', async () => {
    const { hashClientAttemptToken } = await import('~/lib/client-conversion-attempts')
    const { processClientConversionStatus } = await import('~/server/api/client-conversion-status')
    const attemptId = 'attempt-pending-payment'
    const recoveryToken = 'recovery-token-reconciled'

    await db.insert(schema.clientConversionAttempts).values({
      id: attemptId,
      conversionType: 'png-to-jpg',
      category: 'image',
      ipAddress: '127.0.0.1',
      inputMode: 'file',
      tokenHash: hashClientAttemptToken('stale-token'),
      status: 'pending_payment',
      wasPaid: 0,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    })

    mockReconcileClientPendingPayment.mockImplementation(async (nextAttemptId: string) => {
      await db
        .update(schema.clientConversionAttempts)
        .set({
          status: 'ready',
          wasPaid: 1,
          tokenHash: hashClientAttemptToken(recoveryToken),
          recoveryToken,
        })
        .where(eq(schema.clientConversionAttempts.id, nextAttemptId))
    })

    const result = await processClientConversionStatus({ attemptId }, '127.0.0.1')

    expect(mockReconcileClientPendingPayment).toHaveBeenCalledOnce()
    expect(mockReconcileClientPendingPayment).toHaveBeenCalledWith(attemptId)
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      attemptId,
      status: 'ready',
      paid: true,
      token: recoveryToken,
    })
  })
})
