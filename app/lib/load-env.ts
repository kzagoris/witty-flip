export interface LoadEnvFilesOptions {
  files?: string[]
  force?: boolean
  directories?: string[]
}

let hasLoadedEnvFiles = false

function normalizePathSeparators(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

function resolvePathFromFileUrl(fileUrl: string | URL): string | undefined {
  const url = typeof fileUrl === 'string' ? new URL(fileUrl) : fileUrl

  if (url.protocol !== 'file:') {
    return undefined
  }

  const pathname = decodeURIComponent(url.pathname)

  if (url.host) {
    return `//${url.host}${pathname}`
  }

  if (/^\/[A-Za-z]:/.test(pathname)) {
    return pathname.slice(1)
  }

  return pathname
}

function joinEnvFilePath(directory: string, file: string): string {
  const normalizedDirectory = normalizePathSeparators(directory)

  if (normalizedDirectory === '/') {
    return `/${file}`
  }

  return `${normalizedDirectory.replace(/\/+$/, '')}/${file}`
}

function resolveRepoRootFromModuleUrl(): string | undefined {
  return resolvePathFromFileUrl(new URL('../..', import.meta.url))
}

export function getDefaultEnvFiles(
  nodeEnv = typeof process !== 'undefined' ? process.env?.NODE_ENV : undefined,
): string[] {
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
  const repoRoot = resolveRepoRootFromModuleUrl()
  const currentWorkingDirectory = typeof process !== 'undefined' && typeof process.cwd === 'function'
    ? process.cwd()
    : undefined
  const initWorkingDirectory = typeof process !== 'undefined' ? process.env?.INIT_CWD : undefined

  return [...new Set([
    currentWorkingDirectory,
    initWorkingDirectory,
    repoRoot,
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizePathSeparators))]
}

export function loadEnvFiles(options: LoadEnvFilesOptions = {}): void {
  if (hasLoadedEnvFiles && !options.force) {
    return
  }

  if (typeof process === 'undefined') {
    return
  }

  const env = process.env

  if (!env) {
    return
  }

  if (env.WITTYFLIP_DISABLE_ENV_FILE_LOAD === '1') {
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
        process.loadEnvFile(joinEnvFilePath(directory, file))
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
