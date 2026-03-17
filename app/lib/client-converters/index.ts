import type { ClientConverter, ClientConverterFactory } from './types'

export type LazyClientConverterFactory<TConfig = unknown> = () => Promise<ClientConverterFactory<TConfig>>
const converterRegistry = new Map<string, LazyClientConverterFactory<unknown>>()
let builtInsRegistered = false

export function registerClientConverter<TConfig = unknown>(
  name: string,
  factory: LazyClientConverterFactory<TConfig>,
): void {
  converterRegistry.set(name, factory as LazyClientConverterFactory<unknown>)
}

function registerBuiltInClientConverters(): void {
  if (builtInsRegistered) {
    return
  }

  builtInsRegistered = true
  registerClientConverter(
    'canvas',
    async () => (await import('./canvas-converter')).createCanvasConverter,
  )
  registerClientConverter(
    'webp-wasm',
    async () => (await import('./webp-converter')).createWebpConverter,
  )
}

export function getClientConverterFactory<TConfig = unknown>(
  name: string,
): LazyClientConverterFactory<TConfig> | undefined {
  registerBuiltInClientConverters()

  const loader = converterRegistry.get(name)
  if (!loader) {
    return undefined
  }

  return loader as LazyClientConverterFactory<TConfig>
}

export async function getClientConverter<TConfig = unknown>(
  name: string,
  config: TConfig,
): Promise<ClientConverter | undefined> {
  const factoryLoader = getClientConverterFactory<TConfig>(name)
  const factory = factoryLoader ? await factoryLoader() : undefined
  return factory?.(config)
}
