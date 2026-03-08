import { spawn } from 'node:child_process'
import type { SpawnOptionsWithoutStdio } from 'node:child_process'

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

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk)
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk)
    })

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
