import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import type { Converter, ConvertResult } from '~/lib/converters/index'
import { spawnWithSignal } from '~/lib/converters/spawn-helper'
import { buildErrorResult } from '~/lib/converters/converter-run'
import { sanitizeToolError } from '~/lib/converters/sanitize-error'

export function getLibreOfficeCommand(platform = process.platform): string {
  return platform === 'win32' ? 'soffice' : 'libreoffice'
}

export const libreofficeConverter: Converter = {
  async convert(inputPath, outputPath, signal): Promise<ConvertResult> {
    const start = Date.now()
    const outDir = path.dirname(outputPath)
    const outputFormat = path.extname(outputPath).slice(1).toLowerCase()
    const profileDir = path.join(os.tmpdir(), `lo-${randomUUID()}`)

    if (outputFormat !== 'docx') {
      return {
        success: false,
        outputPath,
        exitCode: -1,
        errorMessage: 'LibreOffice fallback only supports ODT to DOCX conversions.',
        durationMs: Date.now() - start,
      }
    }

    try {
      const libreofficeCommand = getLibreOfficeCommand()
      const result = await spawnWithSignal(
        libreofficeCommand,
        [
          '--headless',
          '--convert-to', outputFormat,
          '--outdir', outDir,
          `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
          inputPath,
        ],
        signal,
        { windowsHide: true },
      )

      const durationMs = Date.now() - start

      if (result.exitCode !== 0) {
        return {
          success: false,
          outputPath,
          exitCode: result.exitCode,
          errorMessage: sanitizeToolError(result.stderr),
          durationMs,
        }
      }

      // LibreOffice names output after input: input.odt → input.docx
      const baseName = path.basename(inputPath, path.extname(inputPath))
      const generatedFile = path.join(outDir, `${baseName}.${outputFormat}`)

      if (generatedFile !== outputPath) {
        await fs.rename(generatedFile, outputPath)
      }

      return {
        success: true,
        outputPath,
        exitCode: 0,
        durationMs,
      }
    } catch (err) {
      return buildErrorResult(err, outputPath, start)
    } finally {
      await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {})
    }
  },
}
