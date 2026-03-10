import { writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { eq, and } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'

import type * as SchemaModule from '~/lib/db/schema'

type DB = Awaited<ReturnType<typeof setupTestDb>>['db']

let db: DB
let schema: { conversions: typeof SchemaModule.conversions; rateLimits: typeof SchemaModule.rateLimits }
let conversionsDir: string

async function seed(overrides: Record<string, unknown> = {}) {
  const id = randomUUID()
  await db.insert(schema.conversions).values({
    id,
    originalFilename: 'test.docx',
    sourceFormat: 'docx',
    targetFormat: 'markdown',
    conversionType: 'docx-to-markdown',
    ipAddress: '127.0.0.1',
    inputFilePath: `${id}.docx`,
    wasPaid: 0,
    status: 'uploaded',
    ...overrides,
  } as Parameters<typeof db.insert>[0] extends { values: (v: infer V) => unknown } ? V : never)
  return id
}

async function getJob(id: string) {
  const [row] = await db
    .select()
    .from(schema.conversions)
    .where(eq(schema.conversions.id, id))
  return row
}

async function getReservedSlots(ip: string, date: string) {
  const [row] = await db
    .select()
    .from(schema.rateLimits)
    .where(and(eq(schema.rateLimits.ipAddress, ip), eq(schema.rateLimits.date, date)))
  return row?.reservedFreeSlots ?? 0
}

beforeEach(async () => {
  vi.resetModules()

  const sandbox = createTestSandbox()
  conversionsDir = sandbox.conversionsDir
  const { db: testDb, schema: testSchema } = await setupTestDb(sandbox)
  db = testDb
  schema = testSchema as typeof schema
})

afterEach(() => {
  vi.useRealTimers()
})

async function runCrashRecovery() {
  const { inArray } = await import('drizzle-orm')
  const { db: recoveryDb } = await import('~/lib/db')
  const { conversions } = await import('~/lib/db/schema')
  const { releaseRateLimitSlot } = await import('~/lib/rate-limit')
  const fs = await import('node:fs/promises')

  const staleJobs = await recoveryDb
    .select()
    .from(conversions)
    .where(inArray(conversions.status, ['queued', 'converting']))

  const now = new Date().toISOString()

  for (const job of staleJobs) {
    await recoveryDb
      .update(conversions)
      .set({
        status: 'failed',
        errorMessage: 'Server restarted during conversion.',
        conversionCompletedAt: now,
      })
      .where(eq(conversions.id, job.id))

    if (job.wasPaid === 0 && job.rateLimitDate) {
      await releaseRateLimitSlot(job.ipAddress, job.rateLimitDate)
    }

    if (job.outputFilePath) {
      await fs.rm(job.outputFilePath, { force: true }).catch(() => {})
    }
  }

  return staleJobs.length
}

describe('crash recovery', () => {
  it('resets stale queued jobs to failed on startup', async () => {
    const id = await seed({ status: 'queued' })

    await runCrashRecovery()

    const row = await getJob(id)
    expect(row?.status).toBe('failed')
    expect(row?.errorMessage).toMatch(/Server restarted/)
    expect(row?.conversionCompletedAt).toBeTruthy()
  })

  it('resets stale converting jobs to failed on startup', async () => {
    const id = await seed({ status: 'converting' })

    await runCrashRecovery()

    const row = await getJob(id)
    expect(row?.status).toBe('failed')
    expect(row?.errorMessage).toMatch(/Server restarted/)
  })

  it('releases reserved rate-limit slots for recovered jobs', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const { reserveRateLimitSlot } = await import('~/lib/rate-limit')
    await reserveRateLimitSlot('127.0.0.1', today)

    await seed({ status: 'queued', wasPaid: 0, rateLimitDate: today })

    const slotsBefore = await getReservedSlots('127.0.0.1', today)
    expect(slotsBefore).toBe(1)

    await runCrashRecovery()

    const slotsAfter = await getReservedSlots('127.0.0.1', today)
    expect(slotsAfter).toBe(0)
  })

  it('deletes partial output artifacts', async () => {
    const id = randomUUID()
    const outputPath = join(conversionsDir, `${id}-output.md`)
    writeFileSync(outputPath, 'partial')

    await seed({ id, inputFilePath: `${id}.docx`, status: 'converting', outputFilePath: outputPath })

    await runCrashRecovery()

    expect(existsSync(outputPath)).toBe(false)
  })

  it('leaves completed, pending_payment, uploaded jobs untouched', async () => {
    const id1 = await seed({ status: 'completed' })
    const id2 = await seed({ status: 'pending_payment' })
    const id3 = await seed({ status: 'uploaded' })

    await runCrashRecovery()

    expect((await getJob(id1))?.status).toBe('completed')
    expect((await getJob(id2))?.status).toBe('pending_payment')
    expect((await getJob(id3))?.status).toBe('uploaded')
  })
})
