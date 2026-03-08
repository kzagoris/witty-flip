import { describe, it, expect, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'
import type { TestSandbox } from '../helpers/test-env'

describe('rate-limit', () => {
  let sandbox: TestSandbox
  let db: Awaited<ReturnType<typeof setupTestDb>>['db']
  let schema: Awaited<ReturnType<typeof setupTestDb>>['schema']

  beforeEach(async () => {
    vi.resetModules()
    sandbox = createTestSandbox()
    const setup = await setupTestDb(sandbox)
    db = setup.db
    schema = setup.schema
  })

  it('fresh IP starts with allowed=true and remaining=2', async () => {
    const { checkRateLimit } = await import('~/lib/rate-limit')
    const result = await checkRateLimit('192.168.1.1')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
    expect(result.limit).toBe(2)
  })

  it('two reservations exhaust quota before completion', async () => {
    const { checkRateLimit, reserveRateLimitSlot } = await import('~/lib/rate-limit')

    await reserveRateLimitSlot('10.0.0.1')
    await reserveRateLimitSlot('10.0.0.1')

    const result = await checkRateLimit('10.0.0.1')
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('releaseRateLimitSlot frees a reserved slot', async () => {
    const { checkRateLimit, releaseRateLimitSlot, reserveRateLimitSlot } = await import('~/lib/rate-limit')

    const reservation = await reserveRateLimitSlot('10.0.0.2')
    await reserveRateLimitSlot('10.0.0.2')
    await releaseRateLimitSlot('10.0.0.2', reservation.rateLimitDate)

    const result = await checkRateLimit('10.0.0.2')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(1)
  })

  it('consumeRateLimitSlot increments completed usage and clears the reservation', async () => {
    const { consumeRateLimitSlot, reserveRateLimitSlot } = await import('~/lib/rate-limit')

    const reservation = await reserveRateLimitSlot('10.0.0.3')
    await consumeRateLimitSlot('10.0.0.3', reservation.rateLimitDate)

    const row = await db.query.rateLimits.findFirst({
      where: eq(schema.rateLimits.ipAddress, '10.0.0.3'),
    })

    expect(row?.freeConversionCount).toBe(1)
    expect(row?.reservedFreeSlots).toBe(0)
  })

  it('checkRateLimit does not mutate state', async () => {
    const { checkRateLimit, reserveRateLimitSlot } = await import('~/lib/rate-limit')

    await reserveRateLimitSlot('10.0.0.4')
    const before = await checkRateLimit('10.0.0.4')
    const after = await checkRateLimit('10.0.0.4')

    expect(after.remaining).toBe(before.remaining)
    expect(after.allowed).toBe(before.allowed)
  })

  it('different IPs are isolated', async () => {
    const { checkRateLimit, reserveRateLimitSlot } = await import('~/lib/rate-limit')

    await reserveRateLimitSlot('10.0.0.5')
    await reserveRateLimitSlot('10.0.0.5')

    const exhausted = await checkRateLimit('10.0.0.5')
    const fresh = await checkRateLimit('10.0.0.6')

    expect(exhausted.allowed).toBe(false)
    expect(fresh.allowed).toBe(true)
    expect(fresh.remaining).toBe(2)
  })

  it('UTC date rollover resets quota', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))

    const { checkRateLimit, reserveRateLimitSlot } = await import('~/lib/rate-limit')

    await reserveRateLimitSlot('10.0.0.7')
    await reserveRateLimitSlot('10.0.0.7')

    const dayOne = await checkRateLimit('10.0.0.7')
    expect(dayOne.allowed).toBe(false)
    expect(dayOne.remaining).toBe(0)

    vi.setSystemTime(new Date('2024-06-16T00:00:00Z'))

    const dayTwo = await checkRateLimit('10.0.0.7')
    expect(dayTwo.allowed).toBe(true)
    expect(dayTwo.remaining).toBe(2)
  })
})
