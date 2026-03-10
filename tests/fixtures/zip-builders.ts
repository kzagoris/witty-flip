interface ZipEntryDef {
  name: string
  content: Buffer | string
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function toBuffer(content: Buffer | string): Buffer {
  return Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8')
}

export function buildZip(entries: ZipEntryDef[]): Buffer {
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

export function buildMinimalOdt(): Buffer {
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

export function buildOdtDocument(paragraphs: string[]): Buffer {
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

export function buildMinimalEpub(): Buffer {
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

export function buildEpubDocument(title: string, bodyHtml: string): Buffer {
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

export function buildDocxDocument(bodyXml: string): Buffer {
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

export function buildTinyPbm(): Buffer {
  return Buffer.from([0x50, 0x34, 0x0a, 0x31, 0x20, 0x31, 0x0a, 0x80])
}
