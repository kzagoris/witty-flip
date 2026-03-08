import { describe, it, expect } from 'vitest'
import { spawnWithSignal } from '~/lib/converters/spawn-helper'

describe('spawnWithSignal', () => {
  it('resolves with exitCode 0 and correct stdout for a simple command', async () => {
    const result = await spawnWithSignal('echo', ['hello'], AbortSignal.timeout(5_000))
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe('hello')
    expect(result.stderr).toBe('')
  })

  it('resolves with non-zero exit code for failing command', async () => {
    const result = await spawnWithSignal('sh', ['-c', 'exit 42'], AbortSignal.timeout(5_000))
    expect(result.exitCode).toBe(42)
  })

  it('rejects with AbortError when signal fires during execution', async () => {
    const controller = new AbortController()
    const promise = spawnWithSignal('sleep', ['10'], controller.signal)
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
      'sh',
      ['-c', 'echo out; echo err >&2'],
      AbortSignal.timeout(5_000),
    )
    expect(result.stdout.trim()).toBe('out')
    expect(result.stderr.trim()).toBe('err')
  })

  it('preserves output beyond the previous truncation threshold', async () => {
    const result = await spawnWithSignal(
      'sh',
      ['-c', "dd if=/dev/zero bs=70000 count=1 status=none | tr '\\000' x"],
      AbortSignal.timeout(5_000),
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.length).toBe(70_000)
  })

  it('respects cwd option', async () => {
    const result = await spawnWithSignal('pwd', [], AbortSignal.timeout(5_000), { cwd: '/tmp' })
    expect(result.exitCode).toBe(0)
    // Resolve symlinks — on some systems /tmp → /private/tmp
    expect(result.stdout.trim()).toMatch(/\/tmp$/)
  })
})
