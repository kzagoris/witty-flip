import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import type { Converter, ConvertResult } from '~/lib/converters/index'
import { spawnWithSignal } from '~/lib/converters/spawn-helper'
import { buildErrorResult } from '~/lib/converters/converter-run'
import { sanitizeToolError } from '~/lib/converters/sanitize-error'

function extractLatexErrors(stdout: string): string {
  const errorLines = stdout
    .split('\n')
    .filter(line => line.startsWith('!'))
    .join('\n')
  return errorLines || 'pdflatex failed'
}

export const pdflatexConverter: Converter = {
  async convert(inputPath, outputPath, signal): Promise<ConvertResult> {
    const start = Date.now()
    let tmpDir: string | undefined

    try {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdflatex-'))

      const result = await spawnWithSignal(
        'pdflatex',
        [
          '-interaction=nonstopmode',
          '-halt-on-error',
          `-output-directory=${tmpDir}`,
          inputPath,
        ],
        signal,
        { cwd: tmpDir },
      )

      const durationMs = Date.now() - start

      if (result.exitCode !== 0) {
        return {
          success: false,
          outputPath,
          exitCode: result.exitCode,
          errorMessage: sanitizeToolError(extractLatexErrors(result.stdout)),
          durationMs,
        }
      }

      // pdflatex names output after input: input.tex → input.pdf
      const baseName = path.basename(inputPath, path.extname(inputPath))
      const generatedPdf = path.join(tmpDir, `${baseName}.pdf`)
      await fs.rename(generatedPdf, outputPath)

      return {
        success: true,
        outputPath,
        exitCode: 0,
        durationMs,
      }
    } catch (err) {
      return buildErrorResult(err, outputPath, start)
    } finally {
      if (tmpDir) {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      }
    }
  },
}
