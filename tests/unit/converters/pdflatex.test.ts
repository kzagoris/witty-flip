import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'
import type { SpawnResult } from '~/lib/converters/spawn-helper'

vi.mock('~/lib/converters/spawn-helper', async (importOriginal) => {
  const original = await importOriginal<typeof import('~/lib/converters/spawn-helper')>()
  return { ...original, spawnWithSignal: vi.fn() }
})
vi.mock('node:fs/promises')
vi.mock('node:os', () => ({
  default: { tmpdir: () => '/tmp' },
  tmpdir: () => '/tmp',
}))

const INPUT = '/data/document.tex'
const OUTPUT = '/data/output.pdf'

describe('pdflatex converter', () => {
  let pdflatexConverter: typeof import('~/lib/converters/pdflatex').pdflatexConverter
  let spawnWithSignal: ReturnType<typeof vi.fn>
  let fsMock: {
    mkdtemp: ReturnType<typeof vi.fn>
    rename: ReturnType<typeof vi.fn>
    rm: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    vi.resetModules()

    const spawnMod = await import('~/lib/converters/spawn-helper')
    spawnWithSignal = spawnMod.spawnWithSignal as ReturnType<typeof vi.fn>

    const fsPromises = await import('node:fs/promises')
    fsMock = {
      mkdtemp: fsPromises.mkdtemp as unknown as ReturnType<typeof vi.fn>,
      rename: fsPromises.rename as unknown as ReturnType<typeof vi.fn>,
      rm: fsPromises.rm as unknown as ReturnType<typeof vi.fn>,
    }
    fsMock.mkdtemp.mockResolvedValue('/tmp/pdflatex-abc123')
    fsMock.rename.mockResolvedValue(undefined)
    fsMock.rm.mockResolvedValue(undefined)

    const mod = await import('~/lib/converters/pdflatex')
    pdflatexConverter = mod.pdflatexConverter
  })

  it('passes -interaction=nonstopmode, -halt-on-error, -output-directory, and isolates cwd', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
    await pdflatexConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    const [cmd, args, signal, opts] = spawnWithSignal.mock.calls[0] as [
      string,
      string[],
      AbortSignal,
      { cwd?: string },
    ]
    expect(cmd).toBe('pdflatex')
    expect(args).toContain('-interaction=nonstopmode')
    expect(args).toContain('-halt-on-error')
    expect(args.some((a: string) => a.startsWith('-output-directory='))).toBe(true)
    expect(args).toContain(INPUT)
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(opts).toEqual({ cwd: '/tmp/pdflatex-abc123' })
  })

  it('renames generated PDF to expected outputPath on success', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
    await pdflatexConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    expect(fsMock.rename).toHaveBeenCalledWith(
      path.join('/tmp', 'pdflatex-abc123', 'document.pdf'),
      OUTPUT,
    )
  })

  it('returns success on exit code 0', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
    const result = await pdflatexConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    expect(result.success).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.outputPath).toBe(OUTPUT)
  })

  it('extracts error lines from stdout (lines starting with !)', async () => {
    const stdout = 'This is pdfTeX\n! Undefined control sequence.\nl.5 \\badcommand\n! Emergency stop.\n'
    spawnWithSignal.mockResolvedValue({ exitCode: 1, stdout, stderr: '' } satisfies SpawnResult)
    const result = await pdflatexConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    expect(result.success).toBe(false)
    expect(result.errorMessage).toContain('Undefined control sequence')
    expect(result.errorMessage).toContain('Emergency stop')
  })

  it('cleans up temp directory on success', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
    await pdflatexConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    expect(fsMock.rm).toHaveBeenCalledWith(
      '/tmp/pdflatex-abc123',
      { recursive: true, force: true },
    )
  })

  it('cleans up temp directory on failure', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 1, stdout: '! Error', stderr: '' } satisfies SpawnResult)
    await pdflatexConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    expect(fsMock.rm).toHaveBeenCalledWith(
      '/tmp/pdflatex-abc123',
      { recursive: true, force: true },
    )
  })

  it('re-throws AbortError and still cleans up', async () => {
    const abortErr = new Error('aborted')
    abortErr.name = 'AbortError'
    spawnWithSignal.mockRejectedValue(abortErr)
    await expect(
      pdflatexConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000)),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fsMock.rm).toHaveBeenCalled()
  })

  it('returns failure with descriptive message on ENOENT', async () => {
    spawnWithSignal.mockRejectedValue(new Error("Tool 'pdflatex' is not installed"))
    const result = await pdflatexConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    expect(result.success).toBe(false)
    expect(result.exitCode).toBe(-1)
    expect(result.errorMessage).toContain('not installed')
  })
})
