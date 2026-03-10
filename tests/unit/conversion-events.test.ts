import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'

import type * as SchemaModule from '~/lib/db/schema'

type DB = Awaited<ReturnType<typeof setupTestDb>>['db']

let db: DB
let schema: {
  conversions: typeof SchemaModule.conversions
  payments: typeof SchemaModule.payments
  conversionEvents: typeof SchemaModule.conversionEvents
}

beforeEach(async () => {
  vi.resetModules()

  const sandbox = createTestSandbox()
  const { db: testDb, schema: testSchema } = await setupTestDb(sandbox)
  db = testDb
  schema = testSchema as typeof schema
})

describe('conversion event history', () => {
  it('records conversion creation and status transitions durably', async () => {
    const fileId = randomUUID()

    await db.insert(schema.conversions).values({
      id: fileId,
      originalFilename: 'test.docx',
      sourceFormat: 'docx',
      targetFormat: 'markdown',
      conversionType: 'docx-to-markdown',
      ipAddress: '127.0.0.1',
      inputFilePath: `${fileId}.docx`,
      status: 'uploaded',
    })

    await db.update(schema.conversions).set({ status: 'queued' }).where(eq(schema.conversions.id, fileId))
    await db.update(schema.conversions).set({ status: 'converting' }).where(eq(schema.conversions.id, fileId))
    await db.update(schema.conversions).set({ status: 'completed' }).where(eq(schema.conversions.id, fileId))

    const events = await db
      .select()
      .from(schema.conversionEvents)
      .where(eq(schema.conversionEvents.fileId, fileId))
      .orderBy(asc(schema.conversionEvents.id))

    expect(events.map(event => [event.eventType, event.fromStatus, event.toStatus])).toEqual([
      ['conversion_created', null, 'uploaded'],
      ['conversion_status_changed', 'uploaded', 'queued'],
      ['conversion_status_changed', 'queued', 'converting'],
      ['conversion_status_changed', 'converting', 'completed'],
    ])
  })

  it('records payment lifecycle events against the conversion file id', async () => {
    const fileId = randomUUID()

    await db.insert(schema.payments).values({
      fileId,
      stripeSessionId: 'sess_test_events',
      amountCents: 49,
      currency: 'usd',
      ipAddress: '127.0.0.1',
      conversionType: 'docx-to-markdown',
      status: 'pending',
    })

    await db
      .update(schema.payments)
      .set({ status: 'completed' })
      .where(eq(schema.payments.stripeSessionId, 'sess_test_events'))

    const events = await db
      .select()
      .from(schema.conversionEvents)
      .where(eq(schema.conversionEvents.fileId, fileId))
      .orderBy(asc(schema.conversionEvents.id))

    expect(events.map(event => [event.eventType, event.paymentStatus])).toEqual([
      ['payment_created', 'pending'],
      ['payment_status_changed', 'completed'],
    ])
  })
})
