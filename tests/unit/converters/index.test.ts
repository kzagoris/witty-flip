import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Converter } from '~/lib/converters/index'

function makeMockConverter(): Converter {
  return { convert: vi.fn() }
}

describe('converter registry', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('registerConverter stores the converter instance', async () => {
    const { registerConverter, getConverter } = await import('~/lib/converters/index')
    const converter = makeMockConverter()
    registerConverter('pandoc', converter)
    expect(getConverter('pandoc')).toBe(converter)
  })

  it('getConverter returns the registered instance', async () => {
    const { registerConverter, getConverter } = await import('~/lib/converters/index')
    const converterA = makeMockConverter()
    const converterB = makeMockConverter()
    registerConverter('tool-a', converterA)
    registerConverter('tool-b', converterB)
    expect(getConverter('tool-a')).toBe(converterA)
    expect(getConverter('tool-b')).toBe(converterB)
  })

  it('unknown tools return undefined', async () => {
    const { getConverter } = await import('~/lib/converters/index')
    expect(getConverter('unknown-tool')).toBeUndefined()
    expect(getConverter('')).toBeUndefined()
  })
})
