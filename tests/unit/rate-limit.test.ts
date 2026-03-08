import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'
import type { TestSandbox } from '../helpers/test-env'

describe('rate-limit', () => {
  let sandbox: TestSandbox

  beforeEach(async () => {
    vi.resetModules()
    sandbox = createTestSandbox()
    await setupTestDb(sandbox)
  })

  it('fresh IP starts with allowed=true and remaining=2', async () => {
    const { checkRateLimit } = await import('~/lib/rate-limit')
    const result = await checkRateLimit('192.168.1.1')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
    expect(result.limit).toBe(2)
  })

  it('two increments exhaust quota', async () => {
    const { checkRateLimit, incrementRateLimit } = await import('~/lib/rate-limit')
    await incrementRateLimit('10.0.0.1')
    await incrementRateLimit('10.0.0.1')
    const result = await checkRateLimit('10.0.0.1')
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('checkRateLimit does not mutate state', async () => {
    const { checkRateLimit, incrementRateLimit } = await import('~/lib/rate-limit')
    await incrementRateLimit('10.0.0.2')
    const before = await checkRateLimit('10.0.0.2')
    const after = await checkRateLimit('10.0.0.2')
    expect(after.remaining).toBe(before.remaining)
    expect(after.allowed).toBe(before.allowed)
  })

  it('different IPs are isolated', async () => {
    const { checkRateLimit, incrementRateLimit } = await import('~/lib/rate-limit')
    await incrementRateLimit('10.0.0.3')
    await incrementRateLimit('10.0.0.3')
    const exhausted = await checkRateLimit('10.0.0.3')
    const fresh = await checkRateLimit('10.0.0.4')
    expect(exhausted.allowed).toBe(false)
    expect(fresh.allowed).toBe(true)
    expect(fresh.remaining).toBe(2)
  })

  it('UTC date rollover resets quota', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))

    const { checkRateLimit, incrementRateLimit } = await import('~/lib/rate-limit')

    await incrementRateLimit('10.0.0.5')
    await incrementRateLimit('10.0.0.5')
    const dayOne = await checkRateLimit('10.0.0.5')
    expect(dayOne.allowed).toBe(false)
    expect(dayOne.remaining).toBe(0)

    // Advance clock past UTC midnight
    vi.setSystemTime(new Date('2024-06-16T00:00:00Z'))
    const dayTwo = await checkRateLimit('10.0.0.5')
    expect(dayTwo.allowed).toBe(true)
    expect(dayTwo.remaining).toBe(2)
  })
})
