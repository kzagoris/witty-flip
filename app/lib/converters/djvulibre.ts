import type { Converter } from '~/lib/converters/index'
import { runSimpleConversion } from '~/lib/converters/converter-run'

export const djvulibreConverter: Converter = {
  convert: (inputPath, outputPath, signal) =>
    runSimpleConversion('ddjvu', ['-format=pdf', inputPath, outputPath], outputPath, signal),
}
