import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SpawnResult } from '~/lib/converters/spawn-helper'

vi.mock('~/lib/converters/spawn-helper', async (importOriginal) => {
  const original = await importOriginal<typeof import('~/lib/converters/spawn-helper')>()
  return { ...original, spawnWithSignal: vi.fn() }
})

describe('pandoc converter', () => {
  let pandocConverter: typeof import('~/lib/converters/pandoc').pandocConverter
  let spawnWithSignal: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    const spawnMod = await import('~/lib/converters/spawn-helper')
    spawnWithSignal = spawnMod.spawnWithSignal as ReturnType<typeof vi.fn>
    const mod = await import('~/lib/converters/pandoc')
    pandocConverter = mod.pandocConverter
  })

  describe('DOCX → Markdown', () => {
    const INPUT = '/data/input.docx'
    const OUTPUT = '/data/output.md'

    it('passes -t markdown flag', async () => {
      spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
      await pandocConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
      const args = spawnWithSignal.mock.calls[0][1] as string[]
      expect(args).toContain('-t')
      expect(args[args.indexOf('-t') + 1]).toBe('markdown')
    })

    it('returns success on exit code 0', async () => {
      spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
      const result = await pandocConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
      expect(result.success).toBe(true)
      expect(result.exitCode).toBe(0)
      expect(result.outputPath).toBe(OUTPUT)
    })

    it('returns failure with stderr on non-zero exit', async () => {
      spawnWithSignal.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'pandoc error' } satisfies SpawnResult)
      const result = await pandocConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
      expect(result.success).toBe(false)
      expect(result.errorMessage).toContain('pandoc error')
    })

    it('re-throws AbortError', async () => {
      const abortErr = new Error('aborted')
      abortErr.name = 'AbortError'
      spawnWithSignal.mockRejectedValue(abortErr)
      await expect(
        pandocConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000)),
      ).rejects.toMatchObject({ name: 'AbortError' })
    })
  })

  describe('Markdown → PDF', () => {
    const INPUT = '/data/input.md'
    const OUTPUT = '/data/output.pdf'

    it('passes --pdf-engine=weasyprint flag', async () => {
      spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
      await pandocConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
      const args = spawnWithSignal.mock.calls[0][1] as string[]
      expect(args).toContain('--pdf-engine=weasyprint')
    })

    it('also works with .markdown extension', async () => {
      spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
      await pandocConverter.convert('/data/input.markdown', OUTPUT, AbortSignal.timeout(5_000))
      const args = spawnWithSignal.mock.calls[0][1] as string[]
      expect(args).toContain('--pdf-engine=weasyprint')
    })

    it('returns success on exit code 0', async () => {
      spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
      const result = await pandocConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
      expect(result.success).toBe(true)
    })

    it('returns failure with stderr on non-zero exit', async () => {
      spawnWithSignal.mockResolvedValue({ exitCode: 43, stdout: '', stderr: 'pdf engine error' } satisfies SpawnResult)
      const result = await pandocConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
      expect(result.success).toBe(false)
      expect(result.exitCode).toBe(43)
      expect(result.errorMessage).toContain('pdf engine error')
    })

    it('re-throws AbortError', async () => {
      const abortErr = new Error('aborted')
      abortErr.name = 'AbortError'
      spawnWithSignal.mockRejectedValue(abortErr)
      await expect(
        pandocConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000)),
      ).rejects.toMatchObject({ name: 'AbortError' })
    })

    it('returns failure on ENOENT', async () => {
      spawnWithSignal.mockRejectedValue(new Error("Tool 'pandoc' is not installed"))
      const result = await pandocConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
      expect(result.success).toBe(false)
      expect(result.exitCode).toBe(-1)
      expect(result.errorMessage).toContain('not installed')
    })
  })

  describe('ODT → DOCX', () => {
    const INPUT = '/data/input.odt'
    const OUTPUT = '/data/output.docx'

    it('does not add extra flags (pandoc infers from extensions)', async () => {
      spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
      await pandocConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
      const args = spawnWithSignal.mock.calls[0][1] as string[]
      expect(args).toEqual([INPUT, '-o', OUTPUT])
    })

    it('calls pandoc as the command', async () => {
      spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
      await pandocConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
      expect(spawnWithSignal.mock.calls[0][0]).toBe('pandoc')
    })

    it('returns success on exit code 0', async () => {
      spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
      const result = await pandocConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
      expect(result.success).toBe(true)
      expect(result.outputPath).toBe(OUTPUT)
    })

    it('returns failure on ENOENT', async () => {
      spawnWithSignal.mockRejectedValue(new Error("Tool 'pandoc' is not installed"))
      const result = await pandocConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
      expect(result.success).toBe(false)
      expect(result.exitCode).toBe(-1)
      expect(result.errorMessage).toContain('not installed')
    })

    it('returns failure with stderr on non-zero exit', async () => {
      spawnWithSignal.mockResolvedValue({ exitCode: 9, stdout: '', stderr: 'odt conversion failed' } satisfies SpawnResult)
      const result = await pandocConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
      expect(result.success).toBe(false)
      expect(result.exitCode).toBe(9)
      expect(result.errorMessage).toContain('odt conversion failed')
    })

    it('re-throws AbortError', async () => {
      const abortErr = new Error('aborted')
      abortErr.name = 'AbortError'
      spawnWithSignal.mockRejectedValue(abortErr)
      await expect(
        pandocConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000)),
      ).rejects.toMatchObject({ name: 'AbortError' })
    })
  })
})
