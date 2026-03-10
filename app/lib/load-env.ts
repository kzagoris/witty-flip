import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface LoadEnvFilesOptions {
  files?: string[]
  force?: boolean
  directories?: string[]
}

let hasLoadedEnvFiles = false
const moduleDir = path.dirname(fileURLToPath(import.meta.url))

export function getDefaultEnvFiles(nodeEnv = process.env.NODE_ENV): string[] {
  const files: string[] = []

  if (nodeEnv) {
    files.push(`.env.${nodeEnv}.local`)
  }

  files.push('.env.local')

  if (nodeEnv) {
    files.push(`.env.${nodeEnv}`)
  }

  files.push('.env')

  return [...new Set(files)]
}

export function getDefaultEnvDirectories(): string[] {
  return [...new Set([
    process.cwd(),
    process.env.INIT_CWD,
    path.resolve(moduleDir, '../..'),
  ].filter((value): value is string => Boolean(value)))]
}

export function loadEnvFiles(options: LoadEnvFilesOptions = {}): void {
  if (hasLoadedEnvFiles && !options.force) {
    return
  }

  if (typeof process === 'undefined') {
    return
  }

  if (process.env.WITTYFLIP_DISABLE_ENV_FILE_LOAD === '1') {
    return
  }

  if (typeof process.loadEnvFile !== 'function') {
    hasLoadedEnvFiles = true
    return
  }

  const files = options.files ?? getDefaultEnvFiles()
  const directories = options.directories ?? getDefaultEnvDirectories()

  for (const directory of directories) {
    for (const file of files) {
      try {
        process.loadEnvFile(path.resolve(directory, file).replace(/\\/g, '/'))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          continue
        }

        throw error
      }
    }
  }

  hasLoadedEnvFiles = true
}

export function _resetLoadedEnvFilesForTests(): void {
  hasLoadedEnvFiles = false
}

export function _setLoadedEnvFilesForTests(value: boolean): void {
  hasLoadedEnvFiles = value
}

loadEnvFiles()
