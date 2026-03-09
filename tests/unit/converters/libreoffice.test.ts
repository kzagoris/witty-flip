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
vi.mock('node:crypto', () => ({
  randomUUID: () => 'test-uuid-1234',
}))

const INPUT = '/data/input.odt'
const OUTPUT = '/data/output.docx'

describe('libreoffice converter', () => {
  let libreofficeConverter: typeof import('~/lib/converters/libreoffice').libreofficeConverter
  let spawnWithSignal: ReturnType<typeof vi.fn>
  let fsMock: {
    rename: ReturnType<typeof vi.fn>
    rm: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    vi.resetModules()

    const spawnMod = await import('~/lib/converters/spawn-helper')
    spawnWithSignal = spawnMod.spawnWithSignal as ReturnType<typeof vi.fn>

    const fsPromises = await import('node:fs/promises')
    fsMock = {
      rename: fsPromises.rename as unknown as ReturnType<typeof vi.fn>,
      rm: fsPromises.rm as unknown as ReturnType<typeof vi.fn>,
    }
    fsMock.rename.mockResolvedValue(undefined)
    fsMock.rm.mockResolvedValue(undefined)

    const mod = await import('~/lib/converters/libreoffice')
    libreofficeConverter = mod.libreofficeConverter
  })

  it('passes --headless, --convert-to docx, and --outdir', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
    await libreofficeConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    const args = spawnWithSignal.mock.calls[0][1] as string[]
    expect(args).toContain('--headless')
    expect(args).toContain('--convert-to')
    expect(args[args.indexOf('--convert-to') + 1]).toBe('docx')
    expect(args).toContain('--outdir')
    expect(args).toContain(INPUT)
  })

  it('rejects unsupported output types without spawning libreoffice', async () => {
    const result = await libreofficeConverter.convert(INPUT, '/data/output.pdf', AbortSignal.timeout(5_000))
    expect(result.success).toBe(false)
    expect(result.exitCode).toBe(-1)
    expect(result.errorMessage).toContain('ODT to DOCX')
    expect(spawnWithSignal).not.toHaveBeenCalled()
  })

  it('includes -env:UserInstallation flag', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
    await libreofficeConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    const args = spawnWithSignal.mock.calls[0][1] as string[]
    const envArg = args.find((a: string) => a.startsWith('-env:UserInstallation='))
    expect(envArg).toBeDefined()
    expect(envArg).toContain('file://')
  })

  it('renames output when generated name differs from outputPath', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
    await libreofficeConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    // LibreOffice generates /data/input.docx, expected is /data/output.docx
    expect(fsMock.rename).toHaveBeenCalledWith(path.join('/data', 'input.docx'), OUTPUT)
  })

  it('returns success on exit code 0', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
    const result = await libreofficeConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    expect(result.success).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.outputPath).toBe(OUTPUT)
  })

  it('returns failure with stderr on non-zero exit', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'LibreOffice error' } satisfies SpawnResult)
    const result = await libreofficeConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    expect(result.success).toBe(false)
    expect(result.exitCode).toBe(1)
    expect(result.errorMessage).toContain('LibreOffice error')
  })

  it('cleans up temp profile directory on success', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } satisfies SpawnResult)
    await libreofficeConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    expect(fsMock.rm).toHaveBeenCalledWith(
      path.join('/tmp', 'lo-test-uuid-1234'),
      { recursive: true, force: true },
    )
  })

  it('cleans up temp profile directory on failure', async () => {
    spawnWithSignal.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'err' } satisfies SpawnResult)
    await libreofficeConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    expect(fsMock.rm).toHaveBeenCalledWith(
      path.join('/tmp', 'lo-test-uuid-1234'),
      { recursive: true, force: true },
    )
  })

  it('re-throws AbortError and still cleans up', async () => {
    const abortErr = new Error('aborted')
    abortErr.name = 'AbortError'
    spawnWithSignal.mockRejectedValue(abortErr)
    await expect(
      libreofficeConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000)),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fsMock.rm).toHaveBeenCalled()
  })

  it('returns failure with descriptive message on ENOENT', async () => {
    spawnWithSignal.mockRejectedValue(new Error("Tool 'libreoffice' is not installed"))
    const result = await libreofficeConverter.convert(INPUT, OUTPUT, AbortSignal.timeout(5_000))
    expect(result.success).toBe(false)
    expect(result.exitCode).toBe(-1)
    expect(result.errorMessage).toContain('not installed')
  })
})
