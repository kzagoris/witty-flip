import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'

import type * as SchemaModule from '~/lib/db/schema'

type DB = Awaited<ReturnType<typeof setupTestDb>>['db']

let db: DB
let schema: {
  clientConversionAttempts: typeof SchemaModule.clientConversionAttempts
  conversionEvents: typeof SchemaModule.conversionEvents
}

beforeEach(async () => {
  vi.resetModules()

  const sandbox = createTestSandbox()
  const { db: testDb, schema: testSchema } = await setupTestDb(sandbox)
  db = testDb
  schema = testSchema as typeof schema
})

describe('client conversion attempts', () => {
  it('stores attempt metadata and emits client-scoped lifecycle events', async () => {
    const attemptId = randomUUID()
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString()

    await db.insert(schema.clientConversionAttempts).values({
      id: attemptId,
      conversionType: 'test-client-png-to-jpg',
      category: 'image',
      ipAddress: '127.0.0.1',
      inputMode: 'file',
      originalFilename: 'input.png',
      inputSizeBytes: 1234,
      tokenHash: 'token-hash',
      expiresAt,
    })

    await db
      .update(schema.clientConversionAttempts)
      .set({
        status: 'ready',
        outputFilename: 'output.jpg',
        outputMimeType: 'image/jpeg',
        outputSizeBytes: 4321,
        durationMs: 250,
        completedAt: new Date().toISOString(),
      })
      .where(eq(schema.clientConversionAttempts.id, attemptId))

    const [attempt] = await db
      .select()
      .from(schema.clientConversionAttempts)
      .where(eq(schema.clientConversionAttempts.id, attemptId))

    expect(attempt).toMatchObject({
      id: attemptId,
      conversionType: 'test-client-png-to-jpg',
      category: 'image',
      inputMode: 'file',
      originalFilename: 'input.png',
      outputFilename: 'output.jpg',
      outputMimeType: 'image/jpeg',
      status: 'ready',
      tokenHash: 'token-hash',
      expiresAt,
    })

    const events = await db
      .select()
      .from(schema.conversionEvents)
      .where(eq(schema.conversionEvents.fileId, attemptId))
      .orderBy(asc(schema.conversionEvents.id))

    expect(events.map((event) => [event.eventSource, event.eventType, event.fromStatus, event.toStatus, event.message])).toEqual([
      ['client', 'conversion_created', null, 'reserved', 'Client conversion attempt created.'],
      ['client', 'conversion_status_changed', 'reserved', 'ready', 'Client conversion status changed.'],
    ])
  })

  it('uses the client attempt error message when a status transition fails', async () => {
    const attemptId = randomUUID()

    await db.insert(schema.clientConversionAttempts).values({
      id: attemptId,
      conversionType: 'test-client-png-to-jpg',
      category: 'image',
      ipAddress: '127.0.0.1',
      inputMode: 'paste',
      tokenHash: 'token-hash',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    })

    await db
      .update(schema.clientConversionAttempts)
      .set({
        status: 'failed',
        errorMessage: 'Client conversion failed.',
      })
      .where(eq(schema.clientConversionAttempts.id, attemptId))

    const events = await db
      .select()
      .from(schema.conversionEvents)
      .where(eq(schema.conversionEvents.fileId, attemptId))
      .orderBy(asc(schema.conversionEvents.id))

    expect(events.at(-1)).toMatchObject({
      eventSource: 'client',
      eventType: 'conversion_status_changed',
      fromStatus: 'reserved',
      toStatus: 'failed',
      message: 'Client conversion failed.',
    })
  })
})
