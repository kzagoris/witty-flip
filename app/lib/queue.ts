import fs from 'node:fs'
import { eq, and, asc, or, sql } from 'drizzle-orm'
import { db } from '~/lib/db'
import { conversions } from '~/lib/db/schema'
import { consumeRateLimitSlot, releaseRateLimitSlot } from '~/lib/rate-limit'
import { getConverter } from '~/lib/converters'
import { getConversionBySlug } from '~/lib/conversions'
import { getStoredInputPath, getStoredOutputPath } from '~/lib/conversion-files'

export { CONVERSIONS_DIR } from '~/lib/conversion-files'

const MAX_CONCURRENT_JOBS = 5
const CONVERSION_TIMEOUT_MS = 30_000
const DOWNLOAD_WINDOW_MS = 60 * 60 * 1000

let isProcessing = false
let shouldProcessAgain = false

async function cleanupOutputArtifacts(...pathsToDelete: Array<string | undefined>): Promise<void> {
  const uniquePaths = [...new Set(pathsToDelete.filter((pathValue): pathValue is string => Boolean(pathValue)))]
  await Promise.all(uniquePaths.map(pathValue => fs.promises.rm(pathValue, { force: true }).catch(() => {})))
}

async function releaseReservedSlot(job: typeof conversions.$inferSelect): Promise<void> {
  if (job.wasPaid !== 0 || !job.rateLimitDate) return
  await releaseRateLimitSlot(job.ipAddress, job.rateLimitDate)
}

async function consumeReservedSlot(job: typeof conversions.$inferSelect): Promise<void> {
  if (job.wasPaid !== 0 || !job.rateLimitDate) return
  await consumeRateLimitSlot(job.ipAddress, job.rateLimitDate)
}

export async function enqueueJob(fileId: string): Promise<void> {
  await db
    .update(conversions)
    .set({ status: 'queued' })
    .where(and(
      eq(conversions.id, fileId),
      or(
        eq(conversions.status, 'uploaded'),
        eq(conversions.status, 'pending_payment'),
      ),
    ))

  // Fire-and-forget
  void processQueue()
}

export async function processQueue(): Promise<void> {
  if (isProcessing) {
    shouldProcessAgain = true
    return
  }

  isProcessing = true

  try {
    do {
      shouldProcessAgain = false

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
    } while (shouldProcessAgain)
  } finally {
    isProcessing = false

    if (shouldProcessAgain) {
      void processQueue()
    }
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
      await releaseReservedSlot(job)
      void processQueue()
      return
    }

    const converter = getConverter(conversionMeta.toolName)
    if (!converter) {
      await db
        .update(conversions)
        .set({
          status: 'failed',
          errorMessage: 'Converter not available',
          toolName: conversionMeta.toolName,
        })
        .where(eq(conversions.id, job.id))
      await releaseReservedSlot(job)
      void processQueue()
      return
    }

    const inputPath = getStoredInputPath(job.inputFilePath)
    const outputPath = getStoredOutputPath(job.id, conversionMeta.targetExtension)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), CONVERSION_TIMEOUT_MS)

    try {
      const result = await converter.convert(inputPath, outputPath, controller.signal)
      clearTimeout(timeoutId)

      if (result.success) {
        const resultOutputPath = result.outputPath || outputPath
        let outputSize: number | undefined
        try {
          const stat = fs.statSync(resultOutputPath)
          outputSize = stat.size
        } catch {
          outputSize = undefined
        }

        if (!outputSize) {
          await cleanupOutputArtifacts(resultOutputPath, outputPath)

          await db
            .update(conversions)
            .set({
              status: 'failed',
              errorMessage: 'Conversion did not produce a downloadable file.',
              toolName: conversionMeta.toolName,
              toolExitCode: result.exitCode,
              conversionTimeMs: result.durationMs,
              conversionCompletedAt: new Date().toISOString(),
            })
            .where(eq(conversions.id, job.id))

          await releaseReservedSlot(job)
          return
        }

        await db
          .update(conversions)
          .set({
            status: 'completed',
            expiresAt: new Date(Date.now() + DOWNLOAD_WINDOW_MS).toISOString(),
            toolName: conversionMeta.toolName,
            toolExitCode: result.exitCode,
            conversionTimeMs: result.durationMs,
            outputFileSizeBytes: outputSize,
            conversionCompletedAt: new Date().toISOString(),
          })
          .where(eq(conversions.id, job.id))

        await consumeReservedSlot(job)
      } else {
        await cleanupOutputArtifacts(result.outputPath, outputPath)

        await db
          .update(conversions)
          .set({
            status: 'failed',
            errorMessage: result.errorMessage ?? 'Conversion failed',
            toolName: conversionMeta.toolName,
            toolExitCode: result.exitCode,
            conversionTimeMs: result.durationMs,
            conversionCompletedAt: new Date().toISOString(),
          })
          .where(eq(conversions.id, job.id))

        await releaseReservedSlot(job)
      }
    } catch (err) {
      clearTimeout(timeoutId)
      await cleanupOutputArtifacts(outputPath)

      if (err instanceof Error && err.name === 'AbortError') {
        await db
          .update(conversions)
          .set({
            status: 'timeout',
            errorMessage: 'Conversion timed out. The file may be too complex.',
            toolName: conversionMeta.toolName,
            conversionCompletedAt: new Date().toISOString(),
          })
          .where(eq(conversions.id, job.id))
        await releaseReservedSlot(job)
      } else {
        await db
          .update(conversions)
          .set({
            status: 'failed',
            errorMessage: err instanceof Error ? err.message : 'Unknown error',
            toolName: conversionMeta.toolName,
            conversionCompletedAt: new Date().toISOString(),
          })
          .where(eq(conversions.id, job.id))
        await releaseReservedSlot(job)
      }
    }
  } finally {
    void processQueue()
  }
}
