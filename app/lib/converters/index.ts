export interface ConvertResult {
  success: boolean
  outputPath: string
  exitCode: number
  errorMessage?: string
  durationMs: number
}

export interface Converter {
  convert(inputPath: string, outputPath: string, signal: AbortSignal): Promise<ConvertResult>
}

const converterRegistry = new Map<string, Converter>()

export function getConverter(toolName: string): Converter | undefined {
  return converterRegistry.get(toolName)
}

export function registerConverter(toolName: string, converter: Converter): void {
  converterRegistry.set(toolName, converter)
}
