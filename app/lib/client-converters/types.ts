export type ClientConversionProcessingMode = 'standard' | 'enhanced'

export interface ClientConversionInput {
  file?: File
  text?: string
  filename?: string
}

export interface ClientConversionWarning {
  code: string
  message: string
  details?: string[]
}

export interface ClientConversionOptions {
  signal?: AbortSignal
  quality?: number
  processingMode?: ClientConversionProcessingMode
  /** Reserved — not yet implemented by any converter. */
  preserveColorProfile?: boolean
  keepMetadata?: boolean
  onProgress?: (percent: number) => void
}

export interface ClientConversionResult {
  kind: 'binary' | 'text'
  blob?: Blob
  text?: string
  filename: string
  mimeType: string
  warnings?: ClientConversionWarning[]
}

export interface ClientConverterSupport {
  supported: boolean
  reason?: string
}

export interface ClientConverter {
  isSupported(input?: ClientConversionInput): Promise<ClientConverterSupport>
  convert(input: ClientConversionInput, options?: ClientConversionOptions): Promise<ClientConversionResult>
}

export type ClientConverterFactory<TConfig = unknown> = (config: TConfig) => ClientConverter
