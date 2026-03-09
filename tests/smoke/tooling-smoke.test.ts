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
import { registerTempRoot } from '../setup'

interface ZipEntryDef {
  name: string
  content: Buffer | string
}

const RUN_TOOLING_TESTS = process.env.RUN_TOOLING_TESTS === '1'
const TEST_TIMEOUT_MS = 60_000
const describeIf = RUN_TOOLING_TESTS ? describe : describe.skip

function createSmokeDir(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'wittyflip-tooling-'))
  registerTempRoot(root)
  return root
}

function toBuffer(content: Buffer | string): Buffer {
  return Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8')
}

function buildZip(entries: ZipEntryDef[]): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  const localOffsets: number[] = []
  let runningOffset = 0

  for (const entry of entries) {
    localOffsets.push(runningOffset)
    const nameBytes = Buffer.from(entry.name, 'utf-8')
    const data = toBuffer(entry.content)

    const local = Buffer.alloc(30 + nameBytes.length + data.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(0, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    nameBytes.copy(local, 30)
    data.copy(local, 30 + nameBytes.length)

    localParts.push(local)
    runningOffset += local.length
  }

  const centralDirStart = runningOffset

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const nameBytes = Buffer.from(entry.name, 'utf-8')
    const data = toBuffer(entry.content)

    const central = Buffer.alloc(46 + nameBytes.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(0, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(localOffsets[index], 42)
    nameBytes.copy(central, 46)

    centralParts.push(central)
    runningOffset += central.length
  }

  const centralDirSize = runningOffset - centralDirStart
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralDirSize, 12)
  eocd.writeUInt32LE(centralDirStart, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, ...centralParts, eocd])
}

function buildMinimalOdt(): Buffer {
  return buildZip([
    { name: 'mimetype', content: 'application/vnd.oasis.opendocument.text' },
    {
      name: 'content.xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">
  <office:body>
    <office:text>
      <text:p>Hello tooling smoke test</text:p>
    </office:text>
  </office:body>
</office:document-content>`,
    },
    {
      name: 'styles.xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.2">
  <office:styles />
</office:document-styles>`,
    },
    {
      name: 'meta.xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.2">
  <office:meta />
</office:document-meta>`,
    },
    {
      name: 'settings.xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<office:document-settings xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.2">
  <office:settings />
</office:document-settings>`,
    },
    {
      name: 'META-INF/manifest.xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text" />
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml" />
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml" />
  <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml" />
  <manifest:file-entry manifest:full-path="settings.xml" manifest:media-type="text/xml" />
</manifest:manifest>`,
    },
  ])
}

function buildMinimalEpub(): Buffer {
  return buildZip([
    { name: 'mimetype', content: 'application/epub+zip' },
    {
      name: 'META-INF/container.xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`,
    },
    {
      name: 'content.opf',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<package version="2.0" unique-identifier="BookId" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Tooling Smoke Test</dc:title>
    <dc:language>en</dc:language>
    <dc:identifier id="BookId">urn:uuid:tooling-smoke-test</dc:identifier>
  </metadata>
  <manifest>
    <item id="content" href="chapter.xhtml" media-type="application/xhtml+xml" />
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
  </manifest>
  <spine toc="ncx">
    <itemref idref="content" />
  </spine>
</package>`,
    },
    {
      name: 'toc.ncx',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:tooling-smoke-test" />
  </head>
  <docTitle>
    <text>Tooling Smoke Test</text>
  </docTitle>
  <navMap>
    <navPoint id="navPoint-1" playOrder="1">
      <navLabel>
        <text>Chapter 1</text>
      </navLabel>
      <content src="chapter.xhtml" />
    </navPoint>
  </navMap>
</ncx>`,
    },
    {
      name: 'chapter.xhtml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>Tooling Smoke Test</title>
  </head>
  <body>
    <p>Hello tooling smoke test</p>
  </body>
</html>`,
    },
  ])
}

function buildTinyPbm(): Buffer {
  return Buffer.from([0x50, 0x34, 0x0a, 0x31, 0x20, 0x31, 0x0a, 0x80])
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
