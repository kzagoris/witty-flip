import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'

import type * as SchemaModule from '~/lib/db/schema'
import type * as StatusUtilsModule from '~/server/api/status-utils'

type DB = Awaited<ReturnType<typeof setupTestDb>>['db']

let db: DB
let schema: {
  conversions: typeof SchemaModule.conversions
  conversionEvents: typeof SchemaModule.conversionEvents
}
let buildConversionStatusPayload: typeof StatusUtilsModule.buildConversionStatusPayload
let conversionsDir: string

beforeEach(async () => {
  vi.resetModules()

  const sandbox = createTestSandbox()
  conversionsDir = sandbox.conversionsDir
  const { db: testDb, schema: testSchema } = await setupTestDb(sandbox)
  db = testDb
  schema = testSchema as typeof schema

  const statusUtilsModule = await import('~/server/api/status-utils')
  buildConversionStatusPayload = statusUtilsModule.buildConversionStatusPayload
})

describe('buildConversionStatusPayload', () => {
  it('surfaces a custom payment-required message when checkout recovery asks the user to retry payment', async () => {
    const fileId = randomUUID()

    await db.insert(schema.conversions).values({
      id: fileId,
      originalFilename: 'test.docx',
      sourceFormat: 'docx',
      targetFormat: 'md',
      conversionType: 'docx-to-markdown',
      ipAddress: '127.0.0.1',
      inputFilePath: `${fileId}.docx`,
      status: 'payment_required',
      errorMessage: 'Your checkout session expired. Please try payment again.',
    })

    const conversion = await db.query.conversions.findFirst({
      where: eq(schema.conversions.id, fileId),
    })
    if (!conversion) {
      throw new Error('Expected seeded conversion row to exist.')
    }

    const payload = await buildConversionStatusPayload(conversion)
    expect(payload.status).toBe('payment_required')
    expect(payload.message).toBe('Your checkout session expired. Please try payment again.')
  })

  it('surfaces a custom pending-payment message when the backend is still reconciling payment state', async () => {
    const fileId = randomUUID()

    await db.insert(schema.conversions).values({
      id: fileId,
      originalFilename: 'test.docx',
      sourceFormat: 'docx',
      targetFormat: 'md',
      conversionType: 'docx-to-markdown',
      ipAddress: '127.0.0.1',
      inputFilePath: `${fileId}.docx`,
      status: 'pending_payment',
      errorMessage: 'Waiting for payment confirmation...',
    })

    const conversion = await db.query.conversions.findFirst({
      where: eq(schema.conversions.id, fileId),
    })
    if (!conversion) {
      throw new Error('Expected seeded conversion row to exist.')
    }

    const payload = await buildConversionStatusPayload(conversion)
    expect(payload.status).toBe('pending_payment')
    expect(payload.message).toBe('Waiting for payment confirmation...')
  })

  it('downgrades completed rows with missing output artifacts to failed and records the transition', async () => {
    const fileId = randomUUID()
    const outputFilePath = join(conversionsDir, `${fileId}-output.pdf`)

    await db.insert(schema.conversions).values({
      id: fileId,
      originalFilename: 'test.md',
      sourceFormat: 'markdown',
      targetFormat: 'pdf',
      conversionType: 'markdown-to-pdf',
      ipAddress: '127.0.0.1',
      inputFilePath: `${fileId}.md`,
      outputFilePath,
      status: 'completed',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })

    const conversion = await db.query.conversions.findFirst({
      where: eq(schema.conversions.id, fileId),
    })
    if (!conversion) {
      throw new Error('Expected seeded conversion row to exist.')
    }

    const payload = await buildConversionStatusPayload(conversion)
    expect(payload.status).toBe('failed')
    expect(payload.errorCode).toBe('artifact_missing')

    const updated = await db.query.conversions.findFirst({
      where: eq(schema.conversions.id, fileId),
    })
    expect(updated?.status).toBe('failed')
    expect(updated?.errorMessage).toBe('The converted file is no longer available. Please convert the file again.')

    const events = await db
      .select()
      .from(schema.conversionEvents)
      .where(eq(schema.conversionEvents.fileId, fileId))
      .orderBy(asc(schema.conversionEvents.id))

    expect(events.at(-1)?.eventType).toBe('conversion_status_changed')
    expect(events.at(-1)?.fromStatus).toBe('completed')
    expect(events.at(-1)?.toStatus).toBe('failed')
  })
})
