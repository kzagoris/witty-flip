import { writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'

import type * as SchemaModule from '~/lib/db/schema'
import type * as CleanupModule from '~/lib/cleanup'

type DB = Awaited<ReturnType<typeof setupTestDb>>['db']

let db: DB
let schema: { conversions: typeof SchemaModule.conversions }
let cleanupExpiredFiles: typeof CleanupModule.cleanupExpiredFiles
let _resetCleanupGuard: typeof CleanupModule._resetCleanupGuard
let CONVERSIONS_DIR: string

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

beforeEach(async () => {
  vi.resetModules()

  const sandbox = createTestSandbox()
  const { db: testDb, schema: testSchema } = await setupTestDb(sandbox)
  db = testDb
  schema = testSchema as typeof schema

  const cleanupMod = await import('~/lib/cleanup')
  cleanupExpiredFiles = cleanupMod.cleanupExpiredFiles
  _resetCleanupGuard = cleanupMod._resetCleanupGuard

  // Import CONVERSIONS_DIR from the same module chain cleanup uses
  // to avoid Windows path mismatches between sandbox.conversionsDir and path.resolve
  const convFilesMod = await import('~/lib/conversion-files')
  CONVERSIONS_DIR = convFilesMod.CONVERSIONS_DIR
})

afterEach(() => {
  vi.useRealTimers()
})

describe('cleanupExpiredFiles', () => {
  it('deletes output + input files for expired completed conversions and updates status to expired', async () => {
    const id = randomUUID()
    const inputPath = join(CONVERSIONS_DIR, `${id}.docx`)
    const outputPath = join(CONVERSIONS_DIR, `${id}-output.md`)
    writeFileSync(inputPath, 'input')
    writeFileSync(outputPath, 'output')

    await seed({
      id,
      inputFilePath: `${id}.docx`,
      status: 'completed',
      outputFilePath: outputPath,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    })

    const result = await cleanupExpiredFiles()

    expect(result.cleaned).toBeGreaterThanOrEqual(1)
    expect(existsSync(outputPath)).toBe(false)
    expect(existsSync(inputPath)).toBe(false)

    const row = await getJob(id)
    expect(row?.status).toBe('expired')
  })

  it('uses outputFilePath column when available, falls back to computed path', async () => {
    const id = randomUUID()
    const computedOutputPath = join(CONVERSIONS_DIR, `${id}-output.md`)
    writeFileSync(computedOutputPath, 'output')
    writeFileSync(join(CONVERSIONS_DIR, `${id}.docx`), 'input')

    // No outputFilePath set — should fall back to computed
    await seed({
      id,
      inputFilePath: `${id}.docx`,
      status: 'completed',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    })

    await cleanupExpiredFiles()

    expect(existsSync(computedOutputPath)).toBe(false)
    const row = await getJob(id)
    expect(row?.status).toBe('expired')
  })

  it('deletes input files for old (>1hr) failed/timeout conversions', async () => {
    const id = randomUUID()
    const inputPath = join(CONVERSIONS_DIR, `${id}.docx`)
    writeFileSync(inputPath, 'input')

    await seed({
      id,
      inputFilePath: `${id}.docx`,
      status: 'failed',
      conversionCompletedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    })

    const result = await cleanupExpiredFiles()

    expect(result.cleaned).toBeGreaterThanOrEqual(1)
    expect(existsSync(inputPath)).toBe(false)
  })

  it('cleans stale pending_payment older than 2 hours', async () => {
    const id = randomUUID()
    const inputPath = join(CONVERSIONS_DIR, `${id}.docx`)
    writeFileSync(inputPath, 'input')

    await seed({
      id,
      inputFilePath: `${id}.docx`,
      status: 'pending_payment',
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    })

    const result = await cleanupExpiredFiles()

    expect(result.cleaned).toBeGreaterThanOrEqual(1)
    expect(existsSync(inputPath)).toBe(false)

    const row = await getJob(id)
    expect(row?.status).toBe('expired')
  })

  it('skips queued and converting statuses', async () => {
    const id1 = await seed({ status: 'queued' })
    const id2 = await seed({ status: 'converting' })

    await cleanupExpiredFiles()

    expect((await getJob(id1))?.status).toBe('queued')
    expect((await getJob(id2))?.status).toBe('converting')
  })

  it('handles missing files gracefully (no throw)', async () => {
    const id = randomUUID()
    // Do NOT create the actual file
    await seed({
      id,
      inputFilePath: `${id}.docx`,
      status: 'completed',
      outputFilePath: join(CONVERSIONS_DIR, `${id}-output.md`),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    })

    const result = await cleanupExpiredFiles()
    // Should not throw, and should still update status
    expect(result.errors).toBe(0)
    const row = await getJob(id)
    expect(row?.status).toBe('expired')
  })

  it('concurrency guard prevents overlapping runs', async () => {
    // First run starts normally
    const result1Promise = cleanupExpiredFiles()
    // Second run should be skipped while first is running
    const result2 = await cleanupExpiredFiles()
    await result1Promise

    expect(result2).toEqual({ cleaned: 0, errors: 0 })
  })

  it('handles missing data/conversions directory', async () => {
    // Remove the conversions dir
    rmSync(CONVERSIONS_DIR, { recursive: true, force: true })

    _resetCleanupGuard()
    // Should not throw — ensureConversionsDir will recreate it
    const result = await cleanupExpiredFiles()
    expect(result.errors).toBe(0)
    expect(existsSync(CONVERSIONS_DIR)).toBe(true)
  })

  it('skips symlinks / non-regular files during expired cleanup', async () => {
    const id = randomUUID()
    writeFileSync(join(CONVERSIONS_DIR, 'real.txt'), 'data')

    // Create a subdirectory (should be skipped)
    mkdirSync(join(CONVERSIONS_DIR, 'subdir'), { recursive: true })

    await seed({
      id,
      inputFilePath: `${id}.docx`,
      status: 'completed',
      outputFilePath: join(CONVERSIONS_DIR, `${id}-output.md`),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    })

    // Should not throw on non-regular entries
    const result = await cleanupExpiredFiles()
    expect(result.errors).toBe(0)
  })

  it('returns correct { cleaned, errors } counts', async () => {
    const id1 = randomUUID()
    const id2 = randomUUID()

    writeFileSync(join(CONVERSIONS_DIR, `${id1}.docx`), 'input')
    writeFileSync(join(CONVERSIONS_DIR, `${id1}-output.md`), 'output')
    writeFileSync(join(CONVERSIONS_DIR, `${id2}.docx`), 'input')
    writeFileSync(join(CONVERSIONS_DIR, `${id2}-output.md`), 'output')

    await seed({
      id: id1,
      inputFilePath: `${id1}.docx`,
      status: 'completed',
      outputFilePath: join(CONVERSIONS_DIR, `${id1}-output.md`),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    })

    await seed({
      id: id2,
      inputFilePath: `${id2}.docx`,
      status: 'completed',
      outputFilePath: join(CONVERSIONS_DIR, `${id2}-output.md`),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    })

    const result = await cleanupExpiredFiles()
    expect(result.cleaned).toBe(2)
    expect(result.errors).toBe(0)
  })
})
