import fs, { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'

import type { ConvertResult, Converter } from '~/lib/converters/index'
import type * as QueueModule from '~/lib/queue'
import type * as SchemaModule from '~/lib/db/schema'

// ---------------------------------------------------------------------------
// Suite-level handles, populated fresh by each beforeEach
// ---------------------------------------------------------------------------

type DB = Awaited<ReturnType<typeof setupTestDb>>['db']

let db: DB
let schema: { conversions: typeof SchemaModule.conversions; rateLimits: typeof SchemaModule.rateLimits }
let enqueueJob: typeof QueueModule.enqueueJob
let processQueue: typeof QueueModule.processQueue
let CONVERSIONS_DIR: string
let registerConverter: (name: string, c: Converter) => void

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

/** Poll the real (non-fake) DB until the job reaches the expected status. */
async function waitForStatus(id: string, status: string, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const row = await getJob(id)
    if (row?.status === status) return row
    // Use the un-patched platform timer so this works even after vi.useRealTimers()
    await new Promise<void>(r => setTimeout(r, 15))
  }
  const row = await getJob(id)
  throw new Error(`Job ${id} stuck at "${row?.status}", expected "${status}"`)
}

async function getRateLimitCount(ip: string, date = new Date().toISOString().slice(0, 10)) {
  const [row] = await db
    .select()
    .from(schema.rateLimits)
    .where(
      and(
        eq(schema.rateLimits.ipAddress, ip),
        eq(schema.rateLimits.date, date),
      ),
    )
  return row?.freeConversionCount ?? 0
}

async function getReservedRateLimitCount(ip: string, date = new Date().toISOString().slice(0, 10)) {
  const [row] = await db
    .select()
    .from(schema.rateLimits)
    .where(
      and(
        eq(schema.rateLimits.ipAddress, ip),
        eq(schema.rateLimits.date, date),
      ),
    )
  return row?.reservedFreeSlots ?? 0
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(async () => {
  // Wipe the module registry so every test gets isolated singletons (db, queue
  // state flags, converter registry).
  vi.resetModules()

  const sandbox = createTestSandbox()
  const { db: testDb, schema: testSchema } = await setupTestDb(sandbox)
  db = testDb
  schema = testSchema as typeof schema

  // Dynamic imports run after the sandbox env vars + chdir are in place so
  // module-level constants (CONVERSIONS_DIR, db connection URL) resolve
  // correctly for this test's temp directory.
  const queueMod = await import('~/lib/queue')
  enqueueJob = queueMod.enqueueJob
  processQueue = queueMod.processQueue
  CONVERSIONS_DIR = queueMod.CONVERSIONS_DIR

  const convertersMod = await import('~/lib/converters/index')
  registerConverter = convertersMod.registerConverter
})

afterEach(() => {
  // Ensure real timers are restored even if a test crashes mid-way.
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('enqueueJob — status transitions', () => {
  it('transitions uploaded → queued (and onwards)', async () => {
    registerConverter('pandoc', {
      convert: () => Promise.resolve({ success: false, outputPath: '', exitCode: 1, errorMessage: 'err', durationMs: 0 }),
    })
    const id = await seed({ status: 'uploaded' })
    await enqueueJob(id)
    const row = await waitForStatus(id, 'failed')
    // The job must have passed through 'queued' on its way to 'failed'
    expect(['failed', 'completed']).toContain(row?.status)
  })

  it('transitions pending_payment → queued (and onwards)', async () => {
    registerConverter('pandoc', {
      convert: () => Promise.resolve({ success: false, outputPath: '', exitCode: 1, errorMessage: 'err', durationMs: 0 }),
    })
    const id = await seed({ status: 'pending_payment' })
    await enqueueJob(id)
    const row = await waitForStatus(id, 'failed')
    expect(['failed', 'completed']).toContain(row?.status)
  })

  it('does NOT transition converting → queued', async () => {
    const id = await seed({ status: 'converting' })
    await enqueueJob(id)
    const row = await getJob(id)
    expect(row?.status).toBe('converting') // unchanged
  })

  it('does NOT transition completed → queued', async () => {
    const id = await seed({ status: 'completed' })
    await enqueueJob(id)
    const row = await getJob(id)
    expect(row?.status).toBe('completed') // unchanged
  })

  it('does NOT transition failed → queued', async () => {
    const id = await seed({ status: 'failed' })
    await enqueueJob(id)
    const row = await getJob(id)
    expect(row?.status).toBe('failed') // unchanged
  })
})

// ---------------------------------------------------------------------------

describe('processQueue — concurrency cap', () => {
  it('caps concurrent conversions at 5, leaves remainder queued', async () => {
    const resolvers: Array<() => void> = []

    registerConverter('pandoc', {
      convert: () =>
        new Promise<ConvertResult>(resolve => {
          resolvers.push(() =>
            resolve({ success: false, outputPath: '', exitCode: 1, durationMs: 0 }),
          )
        }),
    })

    await Promise.all(Array.from({ length: 6 }, () => seed({ status: 'queued' })))

    await processQueue()

    const rows = await db.select().from(schema.conversions)
    expect(rows.filter(r => r.status === 'converting').length).toBe(5)
    expect(rows.filter(r => r.status === 'queued').length).toBe(1)

    // Release stuck converters so background promises don't linger.
    resolvers.forEach(r => r())
    // Let the background void processQueue() calls (fired from each runConversion
    // finally block) finish their empty DB scan before afterEach removes the temp dir.
    await new Promise<void>(r => setTimeout(r, 100))
  })
})

// ---------------------------------------------------------------------------

describe('processQueue — re-entrant guard', () => {
  it('does not double-start a job when called concurrently', async () => {
    let startCount = 0

    registerConverter('pandoc', {
      convert: () => {
        startCount++
        return new Promise<ConvertResult>(resolve =>
          setTimeout(
            () => resolve({ success: false, outputPath: '', exitCode: 1, durationMs: 0 }),
            50,
          ),
        )
      },
    })

    const id = await seed({ status: 'queued' })

    // Two concurrent calls: the second must set shouldProcessAgain, not re-enter.
    const p1 = processQueue()
    const p2 = processQueue()
    await Promise.all([p1, p2])

    expect(startCount).toBe(1)

    // Job must eventually complete (the second call triggers shouldProcessAgain
    // re-run, which finds the job converting → skips).
    await waitForStatus(id, 'failed')

    // Drain the background void processQueue() from runConversion's finally block.
    await new Promise<void>(r => setTimeout(r, 100))
  })
})

// ---------------------------------------------------------------------------

describe('runConversion — success path', () => {
  it('marks job completed with size, timing, expiry; increments free quota when wasPaid=0', async () => {
    const id = randomUUID()
    const outputContent = '# Hello Markdown'
    const today = new Date().toISOString().slice(0, 10)

    registerConverter('pandoc', {
      convert: (_input, output) => {
        writeFileSync(output, outputContent)
        return Promise.resolve({ success: true, outputPath: output, exitCode: 0, durationMs: 42 })
      },
    })

    const { reserveRateLimitSlot } = await import('~/lib/rate-limit')
    await reserveRateLimitSlot('127.0.0.1', today)

    await seed({ id, status: 'uploaded', wasPaid: 0, rateLimitDate: today })
    // Provide a stub input file so path resolution inside runConversion is consistent.
    writeFileSync(join(CONVERSIONS_DIR, `${id}.docx`), 'stub')

    await enqueueJob(id)
    const row = await waitForStatus(id, 'completed')

    expect(row?.status).toBe('completed')
    expect(row?.outputFileSizeBytes).toBe(Buffer.byteLength(outputContent))
    expect(row?.conversionTimeMs).toBe(42)
    expect(row?.conversionCompletedAt).toBeTruthy()
    expect(row?.expiresAt).toBeTruthy()

    // expiresAt must be approximately 1 hour after completedAt
    if (!row?.conversionCompletedAt || !row.expiresAt) {
      throw new Error('Expected completed row to include completion timestamps.')
    }
    const completedMs = new Date(row.conversionCompletedAt).getTime()
    const expiresMs = new Date(row.expiresAt).getTime()
    const windowMs = expiresMs - completedMs
    expect(windowMs).toBeGreaterThan(59 * 60 * 1_000)
    expect(windowMs).toBeLessThan(61 * 60 * 1_000)

    // Free quota must be incremented for unpaid conversions.
    expect(await getRateLimitCount('127.0.0.1')).toBe(1)
    expect(await getReservedRateLimitCount('127.0.0.1', '2024-06-15')).toBe(0)
    expect(row?.toolName).toBe('pandoc')
  })

  it('does NOT increment free quota when wasPaid=1', async () => {
    const id = randomUUID()

    registerConverter('pandoc', {
      convert: (_input, output) => {
        writeFileSync(output, 'paid output')
        return Promise.resolve({ success: true, outputPath: output, exitCode: 0, durationMs: 5 })
      },
    })

    await seed({ id, status: 'uploaded', wasPaid: 1 })
    writeFileSync(join(CONVERSIONS_DIR, `${id}.docx`), 'stub')

    await enqueueJob(id)
    await waitForStatus(id, 'completed')

    expect(await getRateLimitCount('127.0.0.1')).toBe(0)
  })
})

// ---------------------------------------------------------------------------

describe('runConversion — failure path', () => {
  it('marks job failed when converter returns success=false; no quota increment', async () => {
    const id = await seed({ status: 'uploaded', rateLimitDate: new Date().toISOString().slice(0, 10) })
    const partialOutputPath = join(CONVERSIONS_DIR, `${id}-output.md`)

    registerConverter('pandoc', {
      convert: () => {
        writeFileSync(partialOutputPath, 'partial')
        return Promise.resolve({
          success: false,
          outputPath: partialOutputPath,
          exitCode: 2,
          errorMessage: 'pandoc exploded',
          durationMs: 7,
        })
      },
    })

    const { reserveRateLimitSlot } = await import('~/lib/rate-limit')
    await reserveRateLimitSlot('127.0.0.1', new Date().toISOString().slice(0, 10))

    await enqueueJob(id)
    const row = await waitForStatus(id, 'failed')

    expect(row?.status).toBe('failed')
    expect(row?.errorMessage).toBe('pandoc exploded')
    expect(row?.toolExitCode).toBe(2)
    expect(row?.toolName).toBe('pandoc')
    expect(await getRateLimitCount('127.0.0.1')).toBe(0)
    expect(await getReservedRateLimitCount('127.0.0.1')).toBe(0)

    expect(() => fs.statSync(partialOutputPath)).toThrow()
  })

  it('sanitizes unexpected thrown error messages before persisting them', async () => {
    const id = await seed({ status: 'uploaded', rateLimitDate: new Date().toISOString().slice(0, 10) })

    const { reserveRateLimitSlot } = await import('~/lib/rate-limit')
    await reserveRateLimitSlot('127.0.0.1', new Date().toISOString().slice(0, 10))

    registerConverter('pandoc', {
      convert: () => {
        throw new Error('Unable to read C:\\sensitive\\nested\\input.docx during conversion')
      },
    })

    await enqueueJob(id)
    const row = await waitForStatus(id, 'failed')

    expect(row?.errorMessage).toContain('input.docx')
    expect(row?.errorMessage).not.toContain('C:\\sensitive')
  })
})

// ---------------------------------------------------------------------------

describe('runConversion — timeout path', () => {
  it('marks job timeout when converter is aborted after 30 s (fake timers)', async () => {
    vi.useFakeTimers()
    const id = await seed({ status: 'uploaded', rateLimitDate: '2024-06-15' })
    const partialOutputPath = join(CONVERSIONS_DIR, `${id}-output.md`)

    const { reserveRateLimitSlot } = await import('~/lib/rate-limit')
    await reserveRateLimitSlot('127.0.0.1', '2024-06-15')

    registerConverter('pandoc', {
      convert: (_input, output, signal) =>
        new Promise<ConvertResult>((_, reject) => {
          writeFileSync(output, 'partial')
          signal.addEventListener('abort', () => {
            const err = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
        }),
    })

    await enqueueJob(id)

    // Advance fake time by 30 s.  vi.advanceTimersByTimeAsync processes pending
    // Promises (including libsql queries) between ticks, so the full async chain
    // — enqueueJob → processQueue → runConversion → setTimeout registration —
    // completes before the 30 s timer fires.
    await vi.advanceTimersByTimeAsync(30_000)

    vi.useRealTimers()

    const row = await waitForStatus(id, 'timeout', 4_000)
    expect(row?.status).toBe('timeout')
    expect(row?.toolName).toBe('pandoc')
    expect(await getReservedRateLimitCount('127.0.0.1')).toBe(0)
    expect(() => fs.statSync(partialOutputPath)).toThrow()
  })
})

// ---------------------------------------------------------------------------

describe('runConversion — missing metadata / converter', () => {
  it('sets status=failed for an unknown conversionType', async () => {
    const id = await seed({ conversionType: 'bogus-type', status: 'queued' })
    await processQueue()
    const row = await waitForStatus(id, 'failed')
    expect(row?.status).toBe('failed')
    expect(row?.errorMessage).toMatch(/unknown/i)
  })

  it('sets status=failed when the converter is not registered', async () => {
    // No converter registered for 'pandoc'; conversionType is valid.
    const id = await seed({ status: 'queued' })
    await processQueue()
    const row = await waitForStatus(id, 'failed')
    expect(row?.status).toBe('failed')
    expect(row?.errorMessage).toMatch(/not available/i)
  })
})

// ---------------------------------------------------------------------------

describe('queue drain — next job after completion', () => {
  it('starts the 6th queued job once a converting slot is freed', async () => {
    const resolvers: Array<() => void> = []

    registerConverter('pandoc', {
      convert: () =>
        new Promise<ConvertResult>(resolve => {
          resolvers.push(() =>
            resolve({ success: false, outputPath: '', exitCode: 1, durationMs: 0 }),
          )
        }),
    })

    // Seed 6 jobs; processQueue will start 5 and leave 1 queued.
    await Promise.all(Array.from({ length: 6 }, () => seed({ status: 'queued' })))
    await processQueue()

    let rows = await db.select().from(schema.conversions)
    expect(rows.filter(r => r.status === 'converting').length).toBe(5)
    expect(rows.filter(r => r.status === 'queued').length).toBe(1)

    // Release one slot.  The finally-block in runConversion re-triggers processQueue,
    // which should immediately pick up the remaining queued job.
    resolvers[0]()

    // Wait until the previously-queued job leaves the 'queued' state.
    const deadline = Date.now() + 4_000
    while (Date.now() < deadline) {
      rows = await db.select().from(schema.conversions)
      if (rows.filter(r => r.status === 'queued').length === 0) break
      await new Promise<void>(r => setTimeout(r, 20))
    }

    rows = await db.select().from(schema.conversions)
    expect(rows.filter(r => r.status === 'queued').length).toBe(0)

    // Cleanup: release all remaining blocked converters.
    resolvers.slice(1).forEach(r => r())
    // Drain background void processQueue() calls before afterEach removes the temp dir.
    await new Promise<void>(r => setTimeout(r, 100))
  })
})
