import { describe, it, expect } from 'vitest'
import { spawnWithSignal } from '~/lib/converters/spawn-helper'

describe('spawnWithSignal', () => {
  it('resolves with exitCode 0 and correct stdout for a simple command', async () => {
    const result = await spawnWithSignal(
      process.execPath,
      ['-e', "console.log('hello')"],
      AbortSignal.timeout(5_000),
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe('hello')
    expect(result.stderr).toBe('')
  })

  it('resolves with non-zero exit code for failing command', async () => {
    const result = await spawnWithSignal(
      process.execPath,
      ['-e', 'process.exit(42)'],
      AbortSignal.timeout(5_000),
    )
    expect(result.exitCode).toBe(42)
  })

  it('rejects with AbortError when signal fires during execution', async () => {
    const controller = new AbortController()
    const promise = spawnWithSignal(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 10_000)'],
      controller.signal,
    )
    controller.abort()
    await expect(promise).rejects.toThrow()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects with descriptive error for non-existent binary', async () => {
    await expect(
      spawnWithSignal('nonexistent-tool-xyz', [], AbortSignal.timeout(5_000)),
    ).rejects.toThrow("Tool 'nonexistent-tool-xyz' is not installed")
  })

  it('collects stderr separately from stdout', async () => {
    const result = await spawnWithSignal(
      process.execPath,
      ['-e', "console.log('out'); console.error('err')"],
      AbortSignal.timeout(5_000),
    )
    expect(result.stdout.trim()).toBe('out')
    expect(result.stderr.trim()).toBe('err')
  })

  it('preserves output beyond the previous truncation threshold', async () => {
    const result = await spawnWithSignal(
      process.execPath,
      ['-e', "process.stdout.write('x'.repeat(70_000))"],
      AbortSignal.timeout(5_000),
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.length).toBe(70_000)
  })

  it('respects cwd option', async () => {
    const result = await spawnWithSignal(
      process.execPath,
      ['-e', 'console.log(process.cwd())'],
      AbortSignal.timeout(5_000),
      { cwd: process.cwd() },
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(process.cwd())
  })
})
