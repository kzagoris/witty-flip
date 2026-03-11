import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'vite'
import { registerTempRoot } from '../setup'

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

  it('stays browser-compatible when bundled by Vite', async () => {
    const tempDir = await fs.mkdtemp(path.join(process.cwd(), '.tmp-load-env-'))
    registerTempRoot(tempDir)

    const entryPath = path.join(tempDir, 'entry.ts')
    const loadEnvPath = path.resolve(process.cwd(), 'app/lib/load-env.ts')
    const importPath = path.relative(tempDir, loadEnvPath).replace(/\\/g, '/')

    await fs.writeFile(entryPath, `import ${JSON.stringify(importPath)}\n`)

    const buildResult = await build({
      configFile: false,
      logLevel: 'silent',
      root: tempDir,
      build: {
        minify: false,
        target: 'esnext',
        write: false,
        rollupOptions: {
          input: entryPath,
        },
      },
    })

    const outputs = Array.isArray(buildResult) ? buildResult : [buildResult]
    const bundledCode = outputs
      .flatMap((output) => ('output' in output ? output.output : []))
      .filter((chunk) => chunk.type === 'chunk')
      .map((chunk) => chunk.code)
      .join('\n')

    expect(bundledCode).not.toContain('__vite-browser-external')
    expect(bundledCode).not.toContain('node:url')
    expect(bundledCode).not.toContain('node:path')
  })
})
