import { registerAllConverters } from '~/lib/converters/register-all'
import { validateEnv } from '~/lib/env'
import { logger } from '~/lib/logger'
import { cleanupExpiredFiles, scanOrphanFiles } from '~/lib/cleanup'

let initialized = false
let cronTask: { stop: () => void } | null = null
let sigTermHandler: (() => void) | null = null

async function recoverStaleJobs(): Promise<void> {
  const { inArray } = await import('drizzle-orm')
  const { db } = await import('~/lib/db')
  const { conversions } = await import('~/lib/db/schema')
  const { releaseRateLimitSlot } = await import('~/lib/rate-limit')
  const fs = await import('node:fs/promises')

  const staleJobs = await db
    .select()
    .from(conversions)
    .where(inArray(conversions.status, ['queued', 'converting']))

  if (staleJobs.length === 0) return

  const now = new Date().toISOString()
  const staleIds = staleJobs.map(j => j.id)

  await db
    .update(conversions)
    .set({
      status: 'failed',
      errorMessage: 'Server restarted during conversion.',
      conversionCompletedAt: now,
    })
    .where(inArray(conversions.id, staleIds))

  for (const job of staleJobs) {
    if (job.wasPaid === 0 && job.rateLimitDate) {
      await releaseRateLimitSlot(job.ipAddress, job.rateLimitDate)
    }

    if (job.outputFilePath) {
      await fs.rm(job.outputFilePath, { force: true }).catch(() => {})
    }
  }

  logger.info({ count: staleJobs.length }, 'Recovered stale jobs from previous run')
}

async function startCleanupCron(): Promise<void> {
  try {
    const cron = await import('node-cron')
    cronTask = cron.schedule('*/15 * * * *', () => {
      void cleanupExpiredFiles().then(({ cleaned, errors }) => {
        if (cleaned > 0 || errors > 0) {
          logger.info({ cleaned, errors }, 'Cleanup cron completed')
        }
      })
    })
  } catch {
    logger.warn('node-cron not available — cleanup cron disabled')
  }
}

export function initializeServerRuntime(): void {
  if (initialized) return
  initialized = true

  validateEnv()
  registerAllConverters()

  void recoverStaleJobs()
  void cleanupExpiredFiles().then(({ cleaned, errors }) => {
    if (cleaned > 0 || errors > 0) {
      logger.info({ cleaned, errors }, 'Startup cleanup completed')
    }
  })
  void scanOrphanFiles()
  void startCleanupCron()

  sigTermHandler = () => {
    shutdownServerRuntime()
    process.exit(0)
  }
  process.on('SIGTERM', sigTermHandler)

  logger.info('Server runtime initialized')
}

export function shutdownServerRuntime(): void {
  if (cronTask) {
    cronTask.stop()
    cronTask = null
  }
  if (sigTermHandler) {
    process.removeListener('SIGTERM', sigTermHandler)
    sigTermHandler = null
  }
  initialized = false
  logger.info('Server runtime shut down')
}

export function _resetInitialized(): void {
  shutdownServerRuntime()
}
