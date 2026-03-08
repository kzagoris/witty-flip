import type { Converter } from '~/lib/converters/index'
import { runSimpleConversion } from '~/lib/converters/converter-run'

export const calibreConverter: Converter = {
  convert: (inputPath, outputPath, signal) =>
    runSimpleConversion('ebook-convert', [inputPath, outputPath], outputPath, signal),
}
