import { eq, and } from 'drizzle-orm'
import { db } from '~/lib/db'
import { rateLimits } from '~/lib/db/schema'

export const FREE_DAILY_LIMIT = 2

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  resetAt: string
}

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

function getResetAt(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
}

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const today = getTodayUTC()
  const row = await db.query.rateLimits.findFirst({
    where: and(eq(rateLimits.ipAddress, ip), eq(rateLimits.date, today)),
  })

  const count = row?.freeConversionCount ?? 0
  const remaining = Math.max(0, FREE_DAILY_LIMIT - count)

  return {
    allowed: remaining > 0,
    remaining,
    limit: FREE_DAILY_LIMIT,
    resetAt: getResetAt(),
  }
}

export async function incrementRateLimit(ip: string): Promise<void> {
  const today = getTodayUTC()
  const row = await db.query.rateLimits.findFirst({
    where: and(eq(rateLimits.ipAddress, ip), eq(rateLimits.date, today)),
  })

  if (row) {
    await db
      .update(rateLimits)
      .set({ freeConversionCount: (row.freeConversionCount ?? 0) + 1 })
      .where(eq(rateLimits.id, row.id))
  } else {
    await db.insert(rateLimits).values({
      ipAddress: ip,
      date: today,
      freeConversionCount: 1,
    })
  }
}
