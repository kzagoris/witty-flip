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

    expect(events.map(event => [event.eventSource, event.eventType, event.fromStatus, event.toStatus])).toEqual([
      ['server', 'conversion_created', null, 'uploaded'],
      ['server', 'conversion_status_changed', 'uploaded', 'queued'],
      ['server', 'conversion_status_changed', 'queued', 'converting'],
      ['server', 'conversion_status_changed', 'converting', 'completed'],
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

    expect(events.map(event => [event.eventSource, event.eventType, event.paymentStatus])).toEqual([
      ['server', 'payment_created', 'pending'],
      ['server', 'payment_status_changed', 'completed'],
    ])
  })

  it('records payment lifecycle events against the client attempt id when fileId is null', async () => {
    const clientAttemptId = randomUUID()

    await db.insert(schema.payments).values({
      clientAttemptId,
      stripeSessionId: 'sess_test_client_attempt_events',
      amountCents: 49,
      currency: 'usd',
      ipAddress: '127.0.0.1',
      conversionType: 'test-client-png-to-jpg',
      status: 'pending',
    })

    await db
      .update(schema.payments)
      .set({ status: 'completed' })
      .where(eq(schema.payments.stripeSessionId, 'sess_test_client_attempt_events'))

    const events = await db
      .select()
      .from(schema.conversionEvents)
      .where(eq(schema.conversionEvents.fileId, clientAttemptId))
      .orderBy(asc(schema.conversionEvents.id))

    expect(events.map(event => [event.eventSource, event.eventType, event.paymentStatus])).toEqual([
      ['server', 'payment_created', 'pending'],
      ['server', 'payment_status_changed', 'completed'],
    ])
  })

  it('rejects payments that set both or neither reference keys', async () => {
    await expect(
      db.insert(schema.payments).values({
        stripeSessionId: 'sess_test_missing_reference',
        amountCents: 49,
        currency: 'usd',
        ipAddress: '127.0.0.1',
        conversionType: 'docx-to-markdown',
        status: 'pending',
      }),
    ).rejects.toThrow(/check constraint/i)

    await expect(
      db.insert(schema.payments).values({
        fileId: randomUUID(),
        clientAttemptId: randomUUID(),
        stripeSessionId: 'sess_test_multiple_references',
        amountCents: 49,
        currency: 'usd',
        ipAddress: '127.0.0.1',
        conversionType: 'docx-to-markdown',
        status: 'pending',
      }),
    ).rejects.toThrow(/check constraint/i)
  })

  it('defaults new conversion rows to the document category', async () => {
    const fileId = randomUUID()

    await db.insert(schema.conversions).values({
      id: fileId,
      originalFilename: 'default-category.docx',
      sourceFormat: 'docx',
      targetFormat: 'markdown',
      conversionType: 'docx-to-markdown',
      ipAddress: '127.0.0.1',
      inputFilePath: `${fileId}.docx`,
      status: 'uploaded',
    })

    const [conversion] = await db
      .select()
      .from(schema.conversions)
      .where(eq(schema.conversions.id, fileId))

    expect(conversion?.category).toBe('document')
  })

  it('persists explicit conversion categories when provided', async () => {
    const fileId = randomUUID()

    await db.insert(schema.conversions).values({
      id: fileId,
      originalFilename: 'ebook.epub',
      category: 'ebook',
      sourceFormat: 'epub',
      targetFormat: 'mobi',
      conversionType: 'epub-to-mobi',
      ipAddress: '127.0.0.1',
      inputFilePath: `${fileId}.epub`,
      status: 'uploaded',
    })

    const [conversion] = await db
      .select()
      .from(schema.conversions)
      .where(eq(schema.conversions.id, fileId))

    expect(conversion?.category).toBe('ebook')
  })

  it('defaults server-side event rows to the server event source', async () => {
    const fileId = randomUUID()

    await db.insert(schema.conversions).values({
      id: fileId,
      originalFilename: 'server-source.docx',
      sourceFormat: 'docx',
      targetFormat: 'markdown',
      conversionType: 'docx-to-markdown',
      ipAddress: '127.0.0.1',
      inputFilePath: `${fileId}.docx`,
      status: 'uploaded',
    })

    const [event] = await db
      .select()
      .from(schema.conversionEvents)
      .where(eq(schema.conversionEvents.fileId, fileId))

    expect(event?.eventSource).toBe('server')
  })
})
