import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const samplesRoot = path.resolve('tests', 'fixtures', 'samples')

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function toBuffer(content) {
  return Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8')
}

function buildZip(entries) {
  const localParts = []
  const centralParts = []
  const localOffsets = []
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

function buildDocxDocument(bodyXml) {
  return buildZip([
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="xml" ContentType="application/xml" />
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" />
</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml" />
</Relationships>`,
    },
    {
      name: 'word/document.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr />
  </w:body>
</w:document>`,
    },
  ])
}

function buildOdtDocument(paragraphs) {
  const body = paragraphs.map(text => `<text:p>${escapeXml(text)}</text:p>`).join('\n      ')

  return buildZip([
    { name: 'mimetype', content: 'application/vnd.oasis.opendocument.text' },
    {
      name: 'content.xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">
  <office:body>
    <office:text>
      ${body}
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

function buildEpubDocument(title, bodyHtml) {
  const safeTitle = escapeXml(title)
  const safeId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')

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
    <dc:title>${safeTitle}</dc:title>
    <dc:language>en</dc:language>
    <dc:identifier id="BookId">urn:uuid:${safeId}</dc:identifier>
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
    <meta name="dtb:uid" content="urn:uuid:${safeId}" />
  </head>
  <docTitle>
    <text>${safeTitle}</text>
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
    <title>${safeTitle}</title>
  </head>
  <body>
    ${bodyHtml}
  </body>
</html>`,
    },
  ])
}

function buildTinyPbm() {
  return Buffer.from([0x50, 0x34, 0x0a, 0x31, 0x20, 0x31, 0x0a, 0x80])
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true })
}

async function writeFileIfChanged(filePath, content) {
  const nextBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8')

  try {
    const current = await fs.readFile(filePath)
    if (current.equals(nextBuffer)) {
      return
    }
  } catch {
    // write below
  }

  await fs.writeFile(filePath, nextBuffer)
}

async function generateTextFixtures() {
  const markdownDir = path.join(samplesRoot, 'markdown')
  const htmlDir = path.join(samplesRoot, 'html')
  const latexDir = path.join(samplesRoot, 'latex')

  await Promise.all([ensureDir(markdownDir), ensureDir(htmlDir), ensureDir(latexDir)])

  await writeFileIfChanged(path.join(markdownDir, 'simple-text.md'), '# Simple Text\n\nHello from WittyFlip fixtures.\n')
  await writeFileIfChanged(path.join(markdownDir, 'headings-lists.md'), '# Heading One\n\n## Heading Two\n\n- item one\n- item two\n')
  await writeFileIfChanged(path.join(markdownDir, 'tables.md'), '| Name | Value |\n| --- | --- |\n| Alpha | 1 |\n| Beta | 2 |\n')
  await writeFileIfChanged(path.join(markdownDir, 'images.md'), '# Images\n\n![Placeholder](data:image/png;base64,iVBORw0KGgo=)\n')
  await writeFileIfChanged(path.join(markdownDir, 'corrupted.md'), Buffer.from([0x48, 0x65, 0xff, 0x6c, 0x6f]))

  await writeFileIfChanged(path.join(htmlDir, 'simple-text.html'), '<!DOCTYPE html><html><body><h1>Simple Text</h1><p>Hello from fixtures.</p></body></html>')
  await writeFileIfChanged(path.join(htmlDir, 'headings-lists.html'), '<!DOCTYPE html><html><body><h1>Heading</h1><h2>Subheading</h2><ul><li>one</li><li>two</li></ul></body></html>')
  await writeFileIfChanged(path.join(htmlDir, 'tables.html'), '<!DOCTYPE html><html><body><table><tr><th>Name</th><th>Value</th></tr><tr><td>Alpha</td><td>1</td></tr></table></body></html>')
  await writeFileIfChanged(path.join(htmlDir, 'images.html'), '<!DOCTYPE html><html><body><h1>Image</h1><img alt="dot" src="data:image/png;base64,iVBORw0KGgo=" /></body></html>')
  await writeFileIfChanged(path.join(htmlDir, 'corrupted.html'), Buffer.from([0x3c, 0x68, 0x74, 0xff, 0x6d, 0x6c]))

  await writeFileIfChanged(path.join(latexDir, 'simple-text.tex'), String.raw`\documentclass{article}
\begin{document}
Simple Text fixture.
\end{document}
`)
  await writeFileIfChanged(path.join(latexDir, 'headings-lists.tex'), String.raw`\documentclass{article}
\begin{document}
\section{Heading One}
\subsection{Heading Two}
\begin{itemize}
  \item First
  \item Second
\end{itemize}
\end{document}
`)
  await writeFileIfChanged(path.join(latexDir, 'tables.tex'), String.raw`\documentclass{article}
\begin{document}
\begin{tabular}{ll}
Name & Value \\
Alpha & 1
\end{tabular}
\end{document}
`)
  await writeFileIfChanged(path.join(latexDir, 'math-formulas.tex'), String.raw`\documentclass{article}
\begin{document}
\[
E = mc^2
\]
\end{document}
`)
  await writeFileIfChanged(path.join(latexDir, 'corrupted.tex'), String.raw`\documentclass{article}
\begin{document}
\badcommand
\end{document}
`)
}

async function generateZipFixtures() {
  const docxDir = path.join(samplesRoot, 'docx')
  const odtDir = path.join(samplesRoot, 'odt')
  const epubDir = path.join(samplesRoot, 'epub')

  await Promise.all([ensureDir(docxDir), ensureDir(odtDir), ensureDir(epubDir)])

  await writeFileIfChanged(
    path.join(docxDir, 'simple-text.docx'),
    buildDocxDocument('<w:p><w:r><w:t>Hello from DOCX fixture.</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph for richer output.</w:t></w:r></w:p>'),
  )
  await writeFileIfChanged(
    path.join(docxDir, 'headings-lists.docx'),
    buildDocxDocument('<w:p><w:r><w:t>Heading One</w:t></w:r></w:p><w:p><w:r><w:t>First bullet item</w:t></w:r></w:p><w:p><w:r><w:t>Second bullet item</w:t></w:r></w:p>'),
  )
  await writeFileIfChanged(
    path.join(docxDir, 'tables.docx'),
    buildDocxDocument('<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Alpha</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'),
  )
  await writeFileIfChanged(
    path.join(docxDir, 'images.docx'),
    buildDocxDocument('<w:p><w:r><w:t>Image placeholder</w:t></w:r></w:p><w:p><w:r><w:t>Caption: inline image sample.</w:t></w:r></w:p>'),
  )
  await writeFileIfChanged(path.join(docxDir, 'corrupted.docx'), Buffer.from('not a valid docx', 'utf-8'))

  const simpleOdt = buildOdtDocument(['Hello tooling smoke test', 'Second paragraph for richer output'])
  await writeFileIfChanged(path.join(odtDir, 'simple-text.odt'), simpleOdt)
  await writeFileIfChanged(path.join(odtDir, 'headings-lists.odt'), buildOdtDocument(['Heading One', 'First bullet item', 'Second bullet item']))
  await writeFileIfChanged(path.join(odtDir, 'tables.odt'), buildOdtDocument(['Name | Value', 'Alpha | 1', 'Beta | 2']))
  await writeFileIfChanged(path.join(odtDir, 'images.odt'), buildOdtDocument(['Image placeholder', 'Caption: inline image sample.']))
  await writeFileIfChanged(path.join(odtDir, 'corrupted.odt'), simpleOdt.subarray(0, Math.floor(simpleOdt.length / 2)))

  const simpleEpub = buildEpubDocument('Tooling Smoke Test', '<h1>Simple Text</h1><p>Hello tooling smoke test.</p><p>Second paragraph for richer output.</p>')
  await writeFileIfChanged(path.join(epubDir, 'simple-text.epub'), simpleEpub)
  await writeFileIfChanged(path.join(epubDir, 'headings-lists.epub'), buildEpubDocument('Headings Lists', '<h1>Heading One</h1><h2>Heading Two</h2><ul><li>First bullet item</li><li>Second bullet item</li></ul>'))
  await writeFileIfChanged(path.join(epubDir, 'tables.epub'), buildEpubDocument('Tables', '<h1>Tables</h1><table><tr><th>Name</th><th>Value</th></tr><tr><td>Alpha</td><td>1</td></tr><tr><td>Beta</td><td>2</td></tr></table>'))
  await writeFileIfChanged(path.join(epubDir, 'images.epub'), buildEpubDocument('Images', '<h1>Images</h1><p>Image placeholder and caption.</p>'))
  await writeFileIfChanged(path.join(epubDir, 'corrupted.epub'), simpleEpub.subarray(0, Math.floor(simpleEpub.length / 2)))
}

async function generateDjvuFixtures() {
  const djvuDir = path.join(samplesRoot, 'djvu')
  await ensureDir(djvuDir)

  const corruptedDjvu = Buffer.from([0x41, 0x54, 0x26, 0x54, 0x46, 0x4f, 0x52, 0x4d])
  await writeFileIfChanged(path.join(djvuDir, 'corrupted.djvu'), corruptedDjvu)

  const simpleDjvuPath = path.join(djvuDir, 'simple-page.djvu')
  try {
    await fs.access(simpleDjvuPath)
  } catch {
    const pbmPath = path.join(djvuDir, 'simple-page.pbm')
    await writeFileIfChanged(pbmPath, buildTinyPbm())

    const result = spawnSync('cjb2', ['-dpi', '300', pbmPath, simpleDjvuPath], {
      stdio: 'ignore',
      windowsHide: true,
    })

    if (result.status !== 0) {
      console.log('DjVu fixture not generated. Install `cjb2` and run: cjb2 -dpi 300 tests/fixtures/samples/djvu/simple-page.pbm tests/fixtures/samples/djvu/simple-page.djvu')
    }
  }
}

async function main() {
  await ensureDir(samplesRoot)
  await generateTextFixtures()
  await generateZipFixtures()
  await generateDjvuFixtures()
  console.log('Fixtures generated under tests/fixtures/samples')
}

await main()
