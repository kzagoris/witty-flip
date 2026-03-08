import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SpawnResult } from '~/lib/converters/spawn-helper'

vi.mock('~/lib/converters/spawn-helper', async (importOriginal) => {
  const original = await importOriginal<typeof import('~/lib/converters/spawn-helper')>()
  return { ...original, spawnWithSignal: vi.fn() }
})

const INPUT = '/data/input.djvu'
const OUTPUT = '/data/output.pdf'

describe('djvulibre converter', () => {
  let djvulibreConverter: typeof import('~/lib/converters/djvulibre').djvulibreConverter
  let spawnWithSignal: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    const spawnMod = await import('~/lib/converters/spawn-helper')
    spawnWithSignal = spawnMod.spawnWithSignal as ReturnType<typeof vi.fn>
    const mod = await import('~/lib/converters/djvulibre')
    djvulibreConverter = mod.djvulibreConverter
  })

  it('calls ddjvu with correct args', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
    const signal = AbortSignal.timeout(5_000)
    await djvulibreConverter.convert(INPUT, OUTPUT, signal)
    expect(spawnWithSignal).toHaveBeenCalledWith(
      'ddjvu',
      ['-format=pdf', INPUT, OUTPUT],
      signal,
    )
  })

  it('returns success on exit code 0', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
    const result = await djvulibreConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    expect(result.success).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.outputPath).toBe(OUTPUT)
    expect(result.errorMessage).toBeUndefined()
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('returns failure with stderr on non-zero exit', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'bad file' } satisfies SpawnResult)
    const result = await djvulibreConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    expect(result.success).toBe(false)
    expect(result.exitCode).toBe(1)
    expect(result.errorMessage).toContain('bad file')
  })

  it('forwards the AbortSignal to spawnWithSignal', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
    const controller = new AbortController()
    await djvulibreConverter.convert(INPUT, OUTPUT, controller.signal)
    expect(spawnWithSignal.mock.calls[0][2]).toBe(controller.signal)
  })

  it('re-throws AbortError', async () => {
    const abortErr = new Error('aborted')
    abortErr.name = 'AbortError'
    spawnWithSignal.mockRejectedValue(abortErr)
    await expect(
      djvulibreConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000)),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('returns failure with descriptive message on ENOENT', async () => {
    spawnWithSignal.mockRejectedValue(new Error("Tool 'ddjvu' is not installed"))
    const result = await djvulibreConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    expect(result.success).toBe(false)
    expect(result.exitCode).toBe(-1)
    expect(result.errorMessage).toContain('not installed')
  })
})
