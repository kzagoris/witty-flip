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

  it('registerIfAbsent does not overwrite an existing registration', async () => {
    const { registerConverter, registerIfAbsent, getConverter } = await import('~/lib/converters/index')
    const original = makeMockConverter()
    const replacement = makeMockConverter()
    registerConverter('pandoc', original)
    registerIfAbsent('pandoc', replacement)
    expect(getConverter('pandoc')).toBe(original)
  })

  it('registerIfAbsent registers when the key is absent', async () => {
    const { registerIfAbsent, getConverter } = await import('~/lib/converters/index')
    const converter = makeMockConverter()
    registerIfAbsent('new-tool', converter)
    expect(getConverter('new-tool')).toBe(converter)
  })
})

describe('registerAllConverters', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  const EXPECTED_TOOLS = ['pandoc', 'djvulibre', 'calibre', 'weasyprint', 'pdflatex', 'libreoffice']

  it('registers all 6 converters', async () => {
    const { registerAllConverters } = await import('~/lib/converters/register-all')
    const { getConverter } = await import('~/lib/converters/index')

    registerAllConverters()

    for (const tool of EXPECTED_TOOLS) {
      expect(getConverter(tool), `${tool} should be registered`).toBeDefined()
    }
  })

  it('is idempotent — repeated calls do not throw or overwrite', async () => {
    const { registerAllConverters } = await import('~/lib/converters/register-all')
    const { getConverter } = await import('~/lib/converters/index')

    registerAllConverters()
    const first = getConverter('pandoc')

    registerAllConverters()
    const second = getConverter('pandoc')

    expect(first).toBe(second)
  })

  it('does not overwrite a converter registered before registerAllConverters is called', async () => {
    const { registerConverter, getConverter } = await import('~/lib/converters/index')
    const { registerAllConverters } = await import('~/lib/converters/register-all')
    const mock = makeMockConverter()

    registerConverter('pandoc', mock)
    registerAllConverters()

    expect(getConverter('pandoc')).toBe(mock)
  })
})
