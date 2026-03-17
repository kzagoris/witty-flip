import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientConverter } from '~/lib/client-converters/types'

describe('client converter registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('provides built-in lazy factories for the planned converter keys', async () => {
    const registry = await import('~/lib/client-converters')

    expect(registry.getClientConverterFactory('canvas')).toBeDefined()
    expect(registry.getClientConverterFactory('webp-wasm')).toBeDefined()
    expect(registry.getClientConverterFactory('svg-png')).toBeUndefined()
  })

  it('registers custom lazy factories and instantiates configured converters', async () => {
    const registry = await import('~/lib/client-converters')
    const createdConfigs: number[] = []
    const makeConverter = vi.fn((config: { value: number }): ClientConverter => {
      createdConfigs.push(config.value)

      return {
        isSupported: vi.fn().mockResolvedValue({ supported: true }),
        convert: vi.fn(),
      }
    })
    const lazyFactory = vi.fn(() => Promise.resolve(makeConverter))

    registry.registerClientConverter('test-client-converter', lazyFactory)

    const first = await registry.getClientConverter('test-client-converter', { value: 1 })
    const second = await registry.getClientConverter('test-client-converter', { value: 2 })

    expect(lazyFactory).toHaveBeenCalledTimes(2)
    expect(makeConverter).toHaveBeenCalledTimes(2)
    expect(createdConfigs).toEqual([1, 2])
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    expect(first).not.toBe(second)
  })

  it('returns undefined for unknown converters', async () => {
    const registry = await import('~/lib/client-converters')

    await expect(
      registry.getClientConverter('missing-client-converter', { value: 1 }),
    ).resolves.toBeUndefined()
  })
})
