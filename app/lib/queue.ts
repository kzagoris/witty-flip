import path from 'node:path'
import fs from 'node:fs'
import { eq, and, asc, sql } from 'drizzle-orm'
import { db } from '~/lib/db'
import { conversions } from '~/lib/db/schema'
import { incrementRateLimit } from '~/lib/rate-limit'
import { getConverter } from '~/lib/converters'
import { getConversionBySlug } from '~/lib/conversions'

const MAX_CONCURRENT_JOBS = 5
const CONVERSION_TIMEOUT_MS = 30_000
const DOWNLOAD_WINDOW_MS = 60 * 60 * 1000

export const CONVERSIONS_DIR = path.resolve('data', 'conversions')

let isProcessing = false

export async function enqueueJob(fileId: string): Promise<void> {
  await db
    .update(conversions)
    .set({ status: 'queued' })
    .where(eq(conversions.id, fileId))

  // Fire-and-forget
  void processQueue()
}

export async function processQueue(): Promise<void> {
  if (isProcessing) return
  isProcessing = true

  try {
    for (;;) {
      // Count active jobs
      const activeResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(conversions)
        .where(eq(conversions.status, 'converting'))
      const activeCount = activeResult[0]?.count ?? 0

      if (activeCount >= MAX_CONCURRENT_JOBS) break

      // Get oldest queued job
      const [nextJob] = await db
        .select()
        .from(conversions)
        .where(eq(conversions.status, 'queued'))
        .orderBy(asc(conversions.createdAt))
        .limit(1)

      if (!nextJob) break

      // Claim the job atomically
      const claimResult = await db
        .update(conversions)
        .set({
          status: 'converting',
          conversionStartedAt: new Date().toISOString(),
        })
        .where(and(eq(conversions.id, nextJob.id), eq(conversions.status, 'queued')))

      if (claimResult.rowsAffected === 0) continue

      // Fire-and-forget the conversion
      void runConversion(nextJob)
    }
  } finally {
    isProcessing = false
  }
}

async function runConversion(job: typeof conversions.$inferSelect): Promise<void> {
  try {
    const conversionMeta = getConversionBySlug(job.conversionType)
    if (!conversionMeta) {
      await db
        .update(conversions)
        .set({ status: 'failed', errorMessage: 'Unknown conversion type' })
        .where(eq(conversions.id, job.id))
      void processQueue()
      return
    }

    const converter = getConverter(conversionMeta.toolName)
    if (!converter) {
      await db
        .update(conversions)
        .set({ status: 'failed', errorMessage: 'Converter not available' })
        .where(eq(conversions.id, job.id))
      void processQueue()
      return
    }

    const inputPath = path.join(CONVERSIONS_DIR, job.inputFilePath)
    const outputPath = path.join(CONVERSIONS_DIR, job.id + '-output' + conversionMeta.targetExtension)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), CONVERSION_TIMEOUT_MS)

    try {
      const result = await converter.convert(inputPath, outputPath, controller.signal)
      clearTimeout(timeoutId)

      if (result.success) {
        let outputSize: number | undefined
        try {
          const stat = fs.statSync(outputPath)
          outputSize = stat.size
        } catch {
          // output file may not exist if converter reported success incorrectly
        }

        await db
          .update(conversions)
          .set({
            status: 'completed',
            expiresAt: new Date(Date.now() + DOWNLOAD_WINDOW_MS).toISOString(),
            toolExitCode: result.exitCode,
            conversionTimeMs: result.durationMs,
            outputFileSizeBytes: outputSize,
            conversionCompletedAt: new Date().toISOString(),
          })
          .where(eq(conversions.id, job.id))

        if (job.wasPaid === 0) {
          await incrementRateLimit(job.ipAddress)
        }
      } else {
        await db
          .update(conversions)
          .set({
            status: 'failed',
            errorMessage: result.errorMessage ?? 'Conversion failed',
            toolExitCode: result.exitCode,
            conversionTimeMs: result.durationMs,
            conversionCompletedAt: new Date().toISOString(),
          })
          .where(eq(conversions.id, job.id))
      }
    } catch (err) {
      clearTimeout(timeoutId)

      if (err instanceof Error && err.name === 'AbortError') {
        await db
          .update(conversions)
          .set({
            status: 'timeout',
            errorMessage: 'Conversion timed out. The file may be too complex.',
            conversionCompletedAt: new Date().toISOString(),
          })
          .where(eq(conversions.id, job.id))
      } else {
        await db
          .update(conversions)
          .set({
            status: 'failed',
            errorMessage: err instanceof Error ? err.message : 'Unknown error',
            conversionCompletedAt: new Date().toISOString(),
          })
          .where(eq(conversions.id, job.id))
      }
    }
  } finally {
    void processQueue()
  }
}
