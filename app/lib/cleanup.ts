import fs from 'node:fs/promises'
import { eq, and, sql, inArray } from 'drizzle-orm'
import { db } from '~/lib/db'
import { clientConversionAttempts, conversions } from '~/lib/db/schema'
import { CONVERSIONS_DIR, ensureConversionsDir, resolveOutputPath, getStoredInputPath } from '~/lib/conversion-files'
import { releaseRateLimitSlot } from '~/lib/rate-limit'
import { isUuid } from '~/server/api/contracts'
import { logger } from '~/lib/logger'

let isRunning = false

export function _resetCleanupGuard(): void {
  isRunning = false
}

export async function cleanupExpiredFiles(): Promise<{ cleaned: number; errors: number }> {
  if (isRunning) return { cleaned: 0, errors: 0 }
  isRunning = true

  let cleaned = 0
  let errors = 0

  try {
    await ensureConversionsDir()

    // 1. Expired completed conversions (expiresAt <= now)
    const now = new Date().toISOString()
    const expiredCompleted = await db
      .select()
      .from(conversions)
      .where(
        and(
          eq(conversions.status, 'completed'),
          sql`${conversions.expiresAt} <= ${now}`,
        ),
      )

    for (const row of expiredCompleted) {
      try {
        const outputPath = resolveOutputPath(row.id, row.conversionType, row.outputFilePath)

        if (outputPath) {
          await fs.rm(outputPath, { force: true })
          logger.debug({ fileId: row.id }, 'Deleted expired output file')
        }

        await fs.rm(getStoredInputPath(row.inputFilePath), { force: true })

        await db
          .update(conversions)
          .set({ status: 'expired' })
          .where(eq(conversions.id, row.id))

        cleaned++
      } catch (err) {
        logger.error({ fileId: row.id, err }, 'Error cleaning expired completed conversion')
        errors++
      }
    }

    // 2. Already-expired rows: best-effort re-scan to delete lingering files
    const alreadyExpired = await db
      .select()
      .from(conversions)
      .where(eq(conversions.status, 'expired'))

    for (const row of alreadyExpired) {
      try {
        const outputPath = resolveOutputPath(row.id, row.conversionType, row.outputFilePath)

        if (outputPath) {
          await fs.rm(outputPath, { force: true })
        }
        await fs.rm(getStoredInputPath(row.inputFilePath), { force: true })
      } catch {
        // best-effort, no error counting
      }
    }

    // 3. Old failed/timeout conversions (>1hr) — delete input files
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const oldFailed = await db
      .select()
      .from(conversions)
      .where(
        and(
          inArray(conversions.status, ['failed', 'timeout']),
          sql`${conversions.conversionCompletedAt} <= ${oneHourAgo}`,
        ),
      )

    for (const row of oldFailed) {
      try {
        await fs.rm(getStoredInputPath(row.inputFilePath), { force: true })
        cleaned++
      } catch (err) {
        logger.error({ fileId: row.id, err }, 'Error cleaning old failed conversion input')
        errors++
      }
    }

    // 4. Stale pending_payment (>2hr) — expire and delete input
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const stalePending = await db
      .select()
      .from(conversions)
      .where(
        and(
          eq(conversions.status, 'pending_payment'),
          sql`${conversions.createdAt} <= ${twoHoursAgo}`,
        ),
      )

    for (const row of stalePending) {
      try {
        await fs.rm(getStoredInputPath(row.inputFilePath), { force: true })

        await db
          .update(conversions)
          .set({ status: 'expired' })
          .where(eq(conversions.id, row.id))

        cleaned++
      } catch (err) {
        logger.error({ fileId: row.id, err }, 'Error cleaning stale pending_payment conversion')
        errors++
      }
    }

    // 5. Expired client conversion attempts — expire rows and release reserved free slots when needed
    const expiredClientAttempts = await db
      .select()
      .from(clientConversionAttempts)
      .where(
        and(
          inArray(clientConversionAttempts.status, ['reserved', 'ready', 'payment_required', 'pending_payment']),
          sql`${clientConversionAttempts.expiresAt} <= ${now}`,
        ),
      )

    for (const row of expiredClientAttempts) {
      try {
        await db.transaction(async (tx) => {
          await tx
            .update(clientConversionAttempts)
            .set({
              status: 'expired',
              recoveryToken: null,
            })
            .where(eq(clientConversionAttempts.id, row.id))

          if (row.status === 'reserved' && row.wasPaid === 0 && row.rateLimitDate) {
            await releaseRateLimitSlot(row.ipAddress, row.rateLimitDate, tx)
          }
        })

        cleaned++
      } catch (err) {
        logger.error({ clientAttemptId: row.id, err }, 'Error expiring stale client conversion attempt')
        errors++
      }
    }

    return { cleaned, errors }
  } finally {
    isRunning = false
  }
}

export async function scanOrphanFiles(): Promise<void> {
  await ensureConversionsDir()

  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(CONVERSIONS_DIR, { withFileTypes: true })
  } catch {
    return
  }

  // Batch-load all known conversion IDs to avoid N+1 queries
  const allRows = await db.select({ id: conversions.id }).from(conversions)
  const knownIds = new Set(allRows.map(r => r.id))

  for (const entry of entries) {
    if (!entry.isFile()) continue

    // Extract UUID prefix (36 chars: 8-4-4-4-12)
    const candidate = entry.name.slice(0, 36)
    if (!isUuid(candidate)) {
      logger.warn({ filename: entry.name }, 'Orphan file with no UUID prefix in conversions dir')
      continue
    }

    if (!knownIds.has(candidate)) {
      logger.warn({ filename: entry.name, fileId: candidate }, 'Orphan file: no matching DB row')
    }
  }
}
