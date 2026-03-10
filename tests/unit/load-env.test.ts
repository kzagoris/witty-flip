import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'node:path'

describe('loadEnvFiles', () => {
  const originalEnv = { ...process.env }
  const originalLoadEnvFile = process.loadEnvFile

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv, WITTYFLIP_DISABLE_ENV_FILE_LOAD: '1' }
    process.loadEnvFile = originalLoadEnvFile
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    process.loadEnvFile = originalLoadEnvFile
  })

  it('loads values from .env when available', async () => {
    delete process.env.METRICS_API_KEY
    delete process.env.WITTYFLIP_DISABLE_ENV_FILE_LOAD

    const loadEnvFileSpy = vi.fn((filePath: string) => {
      if (path.basename(filePath) === '.env') {
        process.env.METRICS_API_KEY = 'loaded-from-spy'
        return
      }

      const error = new Error(`ENOENT: ${filePath}`) as NodeJS.ErrnoException
      error.code = 'ENOENT'
      throw error
    })
    process.loadEnvFile = loadEnvFileSpy

    const { _resetLoadedEnvFilesForTests, loadEnvFiles } = await import('~/lib/load-env')
    _resetLoadedEnvFilesForTests()
    loadEnvFiles({ force: true })

    expect(process.env.METRICS_API_KEY).toBe('loaded-from-spy')
    expect(loadEnvFileSpy).toHaveBeenCalled()
  })

  it('does not override an env var that is already set', async () => {
    process.env.METRICS_API_KEY = 'preexisting-value'
    delete process.env.WITTYFLIP_DISABLE_ENV_FILE_LOAD

    const { _resetLoadedEnvFilesForTests, loadEnvFiles } = await import('~/lib/load-env')
    _resetLoadedEnvFilesForTests()
    loadEnvFiles({ force: true })

    expect(process.env.METRICS_API_KEY).toBe('preexisting-value')
  })
})
