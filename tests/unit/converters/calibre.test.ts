import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SpawnResult } from '~/lib/converters/spawn-helper'

vi.mock('~/lib/converters/spawn-helper', async (importOriginal) => {
  const original = await importOriginal<typeof import('~/lib/converters/spawn-helper')>()
  return { ...original, spawnWithSignal: vi.fn() }
})

const INPUT = '/data/input.epub'
const OUTPUT = '/data/output.mobi'

describe('calibre converter', () => {
  let calibreConverter: typeof import('~/lib/converters/calibre').calibreConverter
  let spawnWithSignal: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    const spawnMod = await import('~/lib/converters/spawn-helper')
    spawnWithSignal = spawnMod.spawnWithSignal as ReturnType<typeof vi.fn>
    const mod = await import('~/lib/converters/calibre')
    calibreConverter = mod.calibreConverter
  })

  it('calls ebook-convert with correct args', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
    const signal = AbortSignal.timeout(5_000)
    await calibreConverter.convert(INPUT, OUTPUT, signal)
    expect(spawnWithSignal).toHaveBeenCalledWith(
      'ebook-convert',
      [INPUT, OUTPUT],
      signal,
    )
  })

  it('returns success on exit code 0', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
    const result = await calibreConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    expect(result.success).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.outputPath).toBe(OUTPUT)
    expect(result.errorMessage).toBeUndefined()
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('returns failure with stderr on non-zero exit', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'invalid epub' } satisfies SpawnResult)
    const result = await calibreConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    expect(result.success).toBe(false)
    expect(result.exitCode).toBe(1)
    expect(result.errorMessage).toContain('invalid epub')
  })

  it('forwards the AbortSignal to spawnWithSignal', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
    const controller = new AbortController()
    await calibreConverter.convert(INPUT, OUTPUT, controller.signal)
    expect(spawnWithSignal.mock.calls[0][2]).toBe(controller.signal)
  })

  it('re-throws AbortError', async () => {
    const abortErr = new Error('aborted')
    abortErr.name = 'AbortError'
    spawnWithSignal.mockRejectedValue(abortErr)
    await expect(
      calibreConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000)),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('returns failure with descriptive message on ENOENT', async () => {
    spawnWithSignal.mockRejectedValue(new Error("Tool 'ebook-convert' is not installed"))
    const result = await calibreConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    expect(result.success).toBe(false)
    expect(result.exitCode).toBe(-1)
    expect(result.errorMessage).toContain('not installed')
  })
})
