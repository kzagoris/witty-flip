import type { ConvertResult } from '~/lib/converters/index'
import { spawnWithSignal } from '~/lib/converters/spawn-helper'
import { sanitizeToolError } from '~/lib/converters/sanitize-error'

/**
 * Shared converter body for simple tools that just run a command with args.
 * Handles timing, result construction, AbortError re-throw, and ENOENT.
 */
export async function runSimpleConversion(
  cmd: string,
  args: string[],
  outputPath: string,
  signal: AbortSignal,
): Promise<ConvertResult> {
  const start = Date.now()
  try {
    const result = await spawnWithSignal(cmd, args, signal)
    const durationMs = Date.now() - start
    return {
      success: result.exitCode === 0,
      outputPath,
      exitCode: result.exitCode,
      errorMessage: result.exitCode !== 0 ? sanitizeToolError(result.stderr) : undefined,
      durationMs,
    }
  } catch (err) {
    return buildErrorResult(err, outputPath, start)
  }
}

/**
 * Shared catch-block logic: re-throws AbortError, wraps everything else.
 */
export function buildErrorResult(
  err: unknown,
  outputPath: string,
  startTime: number,
): ConvertResult {
  if (err instanceof Error && err.name === 'AbortError') throw err
  const durationMs = Date.now() - startTime
  return {
    success: false,
    outputPath,
    exitCode: -1,
    errorMessage: err instanceof Error ? sanitizeToolError(err.message) : 'Unknown error',
    durationMs,
  }
}
