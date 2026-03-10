import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'

const { mockReconcilePendingPayment } = vi.hoisted(() => ({
  mockReconcilePendingPayment: vi.fn(),
}))

vi.mock('~/lib/stripe', () => ({
  reconcilePendingPayment: mockReconcilePendingPayment,
}))

vi.mock('~/lib/server-runtime', () => ({
  initializeServerRuntime: vi.fn(),
}))

type DbType = Awaited<ReturnType<typeof setupTestDb>>['db']
type SchemaType = Awaited<ReturnType<typeof setupTestDb>>['schema']

describe('processConversionStatus', () => {
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

  it('re-reads the conversion after payment reconciliation updates a pending payment state', async () => {
    const fileId = 'conv-status-reconcile'

    await db.insert(schema.conversions).values({
      id: fileId,
      originalFilename: 'test.docx',
      sourceFormat: 'docx',
      targetFormat: 'md',
      conversionType: 'docx-to-markdown',
      ipAddress: '127.0.0.1',
      inputFilePath: `${fileId}.docx`,
      status: 'pending_payment',
    })

    mockReconcilePendingPayment.mockImplementation(async (nextFileId: string) => {
      await db
        .update(schema.conversions)
        .set({
          status: 'payment_required',
          errorMessage: 'Your checkout session expired. Please try payment again.',
        })
        .where(eq(schema.conversions.id, nextFileId))
    })

    const { processConversionStatus } = await import('~/server/api/conversion-status')
    const result = await processConversionStatus({ fileId }, '127.0.0.1')

    expect(mockReconcilePendingPayment).toHaveBeenCalledOnce()
    expect(mockReconcilePendingPayment).toHaveBeenCalledWith(fileId)
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      fileId,
      status: 'payment_required',
      message: 'Your checkout session expired. Please try payment again.',
    })
  })
})
