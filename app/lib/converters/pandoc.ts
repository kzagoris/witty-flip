import path from 'node:path'
import type { Converter } from '~/lib/converters/index'
import { runSimpleConversion } from '~/lib/converters/converter-run'

function buildArgs(inputPath: string, outputPath: string): string[] {
  const inputExt = path.extname(inputPath).toLowerCase()
  const outputExt = path.extname(outputPath).toLowerCase()

  const args = [inputPath, '-o', outputPath]

  if (inputExt === '.docx' && (outputExt === '.md' || outputExt === '.markdown')) {
    args.push('-t', 'markdown')
  } else if ((inputExt === '.md' || inputExt === '.markdown') && outputExt === '.pdf') {
    args.push('--pdf-engine=weasyprint')
  }
  // ODT→DOCX: pandoc infers from extensions, no extra flags needed

  return args
}

export const pandocConverter: Converter = {
  convert: (inputPath, outputPath, signal) =>
    runSimpleConversion('pandoc', buildArgs(inputPath, outputPath), outputPath, signal),
}
