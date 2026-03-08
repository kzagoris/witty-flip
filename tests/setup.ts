import { afterEach, beforeEach, vi } from 'vitest'
import { rmSync } from 'fs'

/** Temp roots created by test-env helpers; cleaned up after each test. */
const tempRoots: string[] = []

/** Register a temp root so it gets removed after the current test. */
export function registerTempRoot(dir: string): void {
  tempRoots.push(dir)
}

const originalCwd = process.cwd()
const originalEnv = { ...process.env }

beforeEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.useRealTimers()
  vi.resetModules()

  // Reset env vars added by tests (keep originals intact)
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, originalEnv)
})

afterEach(() => {
  // Restore working directory
  process.chdir(originalCwd)

  // Remove temp sandboxes
  for (const dir of tempRoots.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  }
})
