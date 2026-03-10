import { mkdtempSync } from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { calibreConverter } from '~/lib/converters/calibre'
import { djvulibreConverter } from '~/lib/converters/djvulibre'
import { libreofficeConverter } from '~/lib/converters/libreoffice'
import type { ConvertResult } from '~/lib/converters/index'
import { pandocConverter } from '~/lib/converters/pandoc'
import { pdflatexConverter } from '~/lib/converters/pdflatex'
import { spawnWithSignal } from '~/lib/converters/spawn-helper'
import { weasyprintConverter } from '~/lib/converters/weasyprint'
import { validateFile } from '~/lib/file-validation'
import { buildMinimalEpub, buildMinimalOdt, buildTinyPbm } from '../fixtures/zip-builders'
import { registerTempRoot } from '../setup'

const RUN_TOOLING_TESTS = process.env.RUN_TOOLING_TESTS === '1'
const TEST_TIMEOUT_MS = 60_000
const describeIf = RUN_TOOLING_TESTS ? describe : describe.skip

function createSmokeDir(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'wittyflip-tooling-'))
  registerTempRoot(root)
  return root
}

async function expectFixtureValid(
  buffer: Buffer,
  declaredFilename: string,
  conversionType: string,
): Promise<void> {
  const validation = await validateFile(buffer, declaredFilename, conversionType)
  expect(validation.valid, validation.error).toBe(true)
}

async function expectSuccessfulConversion(result: ConvertResult, outputPath: string): Promise<void> {
  expect(result.success, result.errorMessage).toBe(true)
  expect(result.exitCode).toBe(0)
  const stats = await fs.stat(outputPath)
  expect(stats.size).toBeGreaterThan(0)
}

async function expectPdfOutput(outputPath: string): Promise<void> {
  const pdf = await fs.readFile(outputPath)
  expect(pdf.subarray(0, 4).toString('ascii')).toBe('%PDF')
}

describeIf('converter tooling smoke tests', () => {
  it('converts Markdown to PDF with pandoc', async () => {
    const root = createSmokeDir()
    const inputPath = path.join(root, 'input.md')
    const outputPath = path.join(root, 'output.pdf')
    const markdown = '# Tooling Smoke Test\n\nHello from pandoc.\n'

    await fs.writeFile(inputPath, markdown, 'utf-8')

    const result = await pandocConverter.convert(inputPath, outputPath, AbortSignal.timeout(TEST_TIMEOUT_MS))

    await expectSuccessfulConversion(result, outputPath)
    await expectPdfOutput(outputPath)
  }, TEST_TIMEOUT_MS)

  it('converts HTML to PDF with weasyprint', async () => {
    const root = createSmokeDir()
    const inputPath = path.join(root, 'input.html')
    const outputPath = path.join(root, 'output.pdf')
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: serif; margin: 24px; }
      h1 { color: #1d4ed8; }
    </style>
  </head>
  <body>
    <h1>Tooling Smoke Test</h1>
    <p>Hello from weasyprint.</p>
  </body>
</html>`

    await fs.writeFile(inputPath, html, 'utf-8')

    const result = await weasyprintConverter.convert(inputPath, outputPath, AbortSignal.timeout(TEST_TIMEOUT_MS))

    await expectSuccessfulConversion(result, outputPath)
    await expectPdfOutput(outputPath)
  }, TEST_TIMEOUT_MS)

  it('converts LaTeX to PDF with pdflatex', async () => {
    const root = createSmokeDir()
    const inputPath = path.join(root, 'input.tex')
    const outputPath = path.join(root, 'output.pdf')
    const latex = String.raw`\documentclass{article}
\begin{document}
Tooling smoke test.
\end{document}
`

    await fs.writeFile(inputPath, latex, 'utf-8')

    const result = await pdflatexConverter.convert(inputPath, outputPath, AbortSignal.timeout(TEST_TIMEOUT_MS))

    await expectSuccessfulConversion(result, outputPath)
    await expectPdfOutput(outputPath)
  }, TEST_TIMEOUT_MS)

  it('converts ODT to DOCX with libreoffice', async () => {
    const root = createSmokeDir()
    const inputPath = path.join(root, 'input.odt')
    const outputPath = path.join(root, 'output.docx')
    const odt = buildMinimalOdt()

    await expectFixtureValid(odt, 'input.odt', 'odt-to-docx')
    await fs.writeFile(inputPath, odt)

    const result = await libreofficeConverter.convert(inputPath, outputPath, AbortSignal.timeout(TEST_TIMEOUT_MS))

    await expectSuccessfulConversion(result, outputPath)

    const output = await fs.readFile(outputPath)
    await expectFixtureValid(output, 'output.docx', 'docx-to-markdown')
  }, TEST_TIMEOUT_MS)

  it('converts EPUB to MOBI with calibre', async () => {
    const root = createSmokeDir()
    const inputPath = path.join(root, 'input.epub')
    const outputPath = path.join(root, 'output.mobi')
    const epub = buildMinimalEpub()

    await expectFixtureValid(epub, 'input.epub', 'epub-to-mobi')
    await fs.writeFile(inputPath, epub)

    const result = await calibreConverter.convert(inputPath, outputPath, AbortSignal.timeout(TEST_TIMEOUT_MS))

    await expectSuccessfulConversion(result, outputPath)

    const output = await fs.readFile(outputPath)
    expect(output.includes(Buffer.from('BOOKMOBI', 'ascii'))).toBe(true)
  }, TEST_TIMEOUT_MS)

  it('converts DjVu to PDF with djvulibre', async () => {
    const root = createSmokeDir()
    const pbmPath = path.join(root, 'input.pbm')
    const inputPath = path.join(root, 'input.djvu')
    const outputPath = path.join(root, 'output.pdf')

    await fs.writeFile(pbmPath, buildTinyPbm())

    const fixtureResult = await spawnWithSignal(
      'cjb2',
      ['-dpi', '300', pbmPath, inputPath],
      AbortSignal.timeout(TEST_TIMEOUT_MS),
    )
    expect(fixtureResult.exitCode, fixtureResult.stderr).toBe(0)

    const djvu = await fs.readFile(inputPath)
    await expectFixtureValid(djvu, 'input.djvu', 'djvu-to-pdf')

    const result = await djvulibreConverter.convert(inputPath, outputPath, AbortSignal.timeout(TEST_TIMEOUT_MS))

    await expectSuccessfulConversion(result, outputPath)
    await expectPdfOutput(outputPath)
  }, TEST_TIMEOUT_MS)
})
