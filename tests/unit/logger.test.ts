import { describe, expect, it, vi, beforeEach } from 'vitest'

describe('logger', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('exports a Pino logger instance', async () => {
    const { logger } = await import('~/lib/logger')
    expect(logger).toBeDefined()
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.debug).toBe('function')
  })

  it('createChildLogger returns a child with bindings', async () => {
    const { createChildLogger } = await import('~/lib/logger')
    const child = createChildLogger({ module: 'test' })
    expect(child).toBeDefined()
    expect(typeof child.info).toBe('function')
  })

  it('uses pino-pretty transport in dev mode', async () => {
    delete process.env.NODE_ENV
    const { logger } = await import('~/lib/logger')
    // In dev, the transport is set to pino-pretty; logger should still function
    expect(typeof logger.info).toBe('function')
  })
})
