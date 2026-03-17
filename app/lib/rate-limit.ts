import { eq, and, sql } from 'drizzle-orm'
import { db, type DbExecutor } from '~/lib/db'
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

interface RateLimitBucket {
  freeConversionCount: number
  reservedFreeSlots: number
}

export interface RateLimitReservation extends RateLimitResult {
  rateLimitDate: string
}

async function ensureRateLimitBucket(ip: string, date: string, executor: DbExecutor = db): Promise<void> {
  await executor
    .insert(rateLimits)
    .values({
      ipAddress: ip,
      date,
      freeConversionCount: 0,
      reservedFreeSlots: 0,
    })
    .onConflictDoNothing()
}

async function getRateLimitBucket(ip: string, date: string, executor: DbExecutor = db): Promise<RateLimitBucket> {
  const row = await executor.query.rateLimits.findFirst({
    where: and(eq(rateLimits.ipAddress, ip), eq(rateLimits.date, date)),
  })

  return {
    freeConversionCount: row?.freeConversionCount ?? 0,
    reservedFreeSlots: row?.reservedFreeSlots ?? 0,
  }
}

function toRateLimitResult(bucket: RateLimitBucket): RateLimitResult {
  const count = bucket.freeConversionCount + bucket.reservedFreeSlots
  const remaining = Math.max(0, FREE_DAILY_LIMIT - count)

  return {
    allowed: remaining > 0,
    remaining,
    limit: FREE_DAILY_LIMIT,
    resetAt: getResetAt(),
  }
}

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  return toRateLimitResult(await getRateLimitBucket(ip, getTodayUTC()))
}

export async function reserveRateLimitSlot(ip: string, date = getTodayUTC(), executor: DbExecutor = db): Promise<RateLimitReservation> {
  await ensureRateLimitBucket(ip, date, executor)

  const claimResult = await executor
    .update(rateLimits)
    .set({
      reservedFreeSlots: sql`coalesce(${rateLimits.reservedFreeSlots}, 0) + 1`,
    })
    .where(and(
      eq(rateLimits.ipAddress, ip),
      eq(rateLimits.date, date),
      sql`coalesce(${rateLimits.freeConversionCount}, 0) + coalesce(${rateLimits.reservedFreeSlots}, 0) < ${FREE_DAILY_LIMIT}`,
    ))

  const status = toRateLimitResult(await getRateLimitBucket(ip, date, executor))

  return {
    ...status,
    allowed: claimResult.rowsAffected > 0,
    rateLimitDate: date,
  }
}

export async function consumeRateLimitSlot(ip: string, date: string, executor: DbExecutor = db): Promise<void> {
  await ensureRateLimitBucket(ip, date, executor)

  await executor
    .update(rateLimits)
    .set({
      freeConversionCount: sql`coalesce(${rateLimits.freeConversionCount}, 0) + 1`,
      reservedFreeSlots: sql`case
        when coalesce(${rateLimits.reservedFreeSlots}, 0) > 0 then coalesce(${rateLimits.reservedFreeSlots}, 0) - 1
        else 0
      end`,
    })
    .where(and(eq(rateLimits.ipAddress, ip), eq(rateLimits.date, date)))
}

export async function releaseRateLimitSlot(ip: string, date: string, executor: DbExecutor = db): Promise<void> {
  await ensureRateLimitBucket(ip, date, executor)

  await executor
    .update(rateLimits)
    .set({
      reservedFreeSlots: sql`case
        when coalesce(${rateLimits.reservedFreeSlots}, 0) > 0 then coalesce(${rateLimits.reservedFreeSlots}, 0) - 1
        else 0
      end`,
    })
    .where(and(eq(rateLimits.ipAddress, ip), eq(rateLimits.date, date)))
}
