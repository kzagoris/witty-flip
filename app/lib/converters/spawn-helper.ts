import { spawn } from 'node:child_process'
import type { SpawnOptionsWithoutStdio } from 'node:child_process'

/** Maximum bytes buffered from stdout + stderr combined before the child is killed. */
const MAX_OUTPUT_BYTES = 100 * 1024 * 1024 // 100 MB

export interface SpawnResult {
  exitCode: number
  stdout: string
  stderr: string
}

export async function spawnWithSignal(
  cmd: string,
  args: string[],
  signal: AbortSignal,
  opts?: SpawnOptionsWithoutStdio,
): Promise<SpawnResult> {
  return new Promise<SpawnResult>((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, signal })

    let settled = false
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let totalBytes = 0

    const onData = (chunks: Buffer[], chunk: Buffer) => {
      if (chunk.length > MAX_OUTPUT_BYTES - totalBytes) {
        child.kill('SIGKILL')
        if (!settled) {
          settled = true
          reject(new Error(`Output size limit exceeded (${MAX_OUTPUT_BYTES} bytes)`))
        }
        return
      }
      totalBytes += chunk.length
      chunks.push(chunk)
    }

    child.stdout.on('data', (chunk: Buffer) => onData(stdoutChunks, chunk))
    child.stderr.on('data', (chunk: Buffer) => onData(stderrChunks, chunk))

    child.on('error', (err: Error) => {
      if (settled) return
      settled = true
      if (err.name === 'AbortError') {
        reject(err)
        return
      }
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error(`Tool '${cmd}' is not installed`))
        return
      }
      reject(err)
    })

    child.on('close', (code: number | null) => {
      if (settled) return
      settled = true
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
      })
    })
  })
}
