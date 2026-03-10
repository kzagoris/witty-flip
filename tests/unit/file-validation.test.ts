import { describe, it, expect } from 'vitest'
import { validateFile, MAX_FILE_SIZE } from '~/lib/file-validation'
import { buildZip } from '../fixtures/zip-builders'

// Minimal DjVu header (16 bytes is the minimum the validator needs)
function buildDjvuHeader(chunkId: 'DJVU' | 'DJVM'): Buffer {
  const buf = Buffer.alloc(16)
  // Bytes 0-3: AT&T
  buf[0] = 0x41; buf[1] = 0x54; buf[2] = 0x26; buf[3] = 0x54
  // Bytes 4-7: FORM
  buf[4] = 0x46; buf[5] = 0x4f; buf[6] = 0x52; buf[7] = 0x4d
  // Bytes 8-11: file length (arbitrary)
  buf.writeUInt32BE(8, 8)
  // Bytes 12-15: chunk id
  Buffer.from(chunkId, 'ascii').copy(buf, 12)
  return buf
}

// ---------------------------------------------------------------------------
// Text-file validation
// ---------------------------------------------------------------------------

describe('validateFile - text files', () => {
  const textExtensions: Array<{ ext: string; slug: string; filename: string }> = [
    { ext: '.md',       slug: 'markdown-to-pdf', filename: 'doc.md' },
    { ext: '.markdown', slug: 'markdown-to-pdf', filename: 'doc.markdown' },
    { ext: '.html',     slug: 'html-to-pdf',     filename: 'page.html' },
    { ext: '.htm',      slug: 'html-to-pdf',     filename: 'page.htm' },
    { ext: '.tex',      slug: 'latex-to-pdf',    filename: 'doc.tex' },
  ]

  for (const { ext, slug, filename } of textExtensions) {
    it(`accepts a valid UTF-8 ${ext} file`, async () => {
      const buf = Buffer.from('Hello, world!', 'utf-8')
      const result = await validateFile(buf, filename, slug)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })
  }

  it('rejects a file with invalid UTF-8 bytes', async () => {
    // 0xFF is not valid in UTF-8
    const buf = Buffer.from([0x48, 0x65, 0xff, 0x6c, 0x6f])
    const result = await validateFile(buf, 'doc.md', 'markdown-to-pdf')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('File is not valid UTF-8 text.')
  })

  it('rejects a zero-byte file', async () => {
    const buf = Buffer.alloc(0)
    const result = await validateFile(buf, 'doc.md', 'markdown-to-pdf')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('File is empty.')
  })

  it('rejects a file that exceeds the 10MB size limit', async () => {
    const buf = Buffer.alloc(MAX_FILE_SIZE + 1, 0x61) // fill with 'a'
    const result = await validateFile(buf, 'doc.md', 'markdown-to-pdf')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('File exceeds the 10MB size limit.')
  })

  it('rejects a file with the wrong extension for the conversion type', async () => {
    const buf = Buffer.from('Hello', 'utf-8')
    const result = await validateFile(buf, 'doc.txt', 'markdown-to-pdf')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Invalid file extension/)
  })
})

// ---------------------------------------------------------------------------
// ZIP-based formats: DOCX
// ---------------------------------------------------------------------------

describe('validateFile - DOCX', () => {
  function buildValidDocx(): Buffer {
    return buildZip([
      { name: '[Content_Types].xml', content: Buffer.from('<Types/>', 'ascii') },
      { name: 'word/document.xml',   content: Buffer.from('<w:document/>', 'ascii') },
    ])
  }

  it('accepts a valid DOCX buffer', async () => {
    const result = await validateFile(buildValidDocx(), 'test.docx', 'docx-to-markdown')
    expect(result.valid).toBe(true)
  })

  it('rejects a spoofed DOCX that is missing [Content_Types].xml', async () => {
    const buf = buildZip([
      { name: 'word/document.xml', content: Buffer.from('<w:document/>', 'ascii') },
    ])
    const result = await validateFile(buf, 'test.docx', 'docx-to-markdown')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('File content does not match the expected document format.')
  })

  it('rejects a spoofed DOCX that is missing the word/ directory', async () => {
    const buf = buildZip([
      { name: '[Content_Types].xml', content: Buffer.from('<Types/>', 'ascii') },
      { name: 'notword/something',   content: Buffer.from('data', 'ascii') },
    ])
    const result = await validateFile(buf, 'test.docx', 'docx-to-markdown')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('File content does not match the expected document format.')
  })
})

// ---------------------------------------------------------------------------
// ZIP-based formats: ODT
// ---------------------------------------------------------------------------

describe('validateFile - ODT', () => {
  function buildValidOdt(): Buffer {
    return buildZip([
      { name: 'mimetype', content: Buffer.from('application/vnd.oasis.opendocument.text', 'ascii') },
      { name: 'content.xml', content: Buffer.from('<office:document/>', 'ascii') },
    ])
  }

  it('accepts a valid ODT buffer', async () => {
    const result = await validateFile(buildValidOdt(), 'test.odt', 'odt-to-docx')
    expect(result.valid).toBe(true)
  })

  it('rejects a spoofed ODT with wrong mimetype', async () => {
    // file-type detects the ODS MIME from the ZIP mimetype entry before we
    // reach the ZIP-structure check, so the earlier "content does not match
    // expected type" error fires.
    const buf = buildZip([
      { name: 'mimetype', content: Buffer.from('application/vnd.oasis.opendocument.spreadsheet', 'ascii') },
    ])
    const result = await validateFile(buf, 'test.odt', 'odt-to-docx')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/File content does not match/)
  })

  it('rejects a spoofed ODT with no mimetype entry', async () => {
    const buf = buildZip([
      { name: 'content.xml', content: Buffer.from('<office:document/>', 'ascii') },
    ])
    const result = await validateFile(buf, 'test.odt', 'odt-to-docx')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('File content does not match the expected document format.')
  })
})

// ---------------------------------------------------------------------------
// ZIP-based formats: EPUB
// ---------------------------------------------------------------------------

describe('validateFile - EPUB', () => {
  function buildValidEpub(): Buffer {
    return buildZip([
      { name: 'mimetype',   content: Buffer.from('application/epub+zip', 'ascii') },
      { name: 'META-INF/container.xml', content: Buffer.from('<container/>', 'ascii') },
    ])
  }

  it('accepts a valid EPUB buffer', async () => {
    const result = await validateFile(buildValidEpub(), 'book.epub', 'epub-to-mobi')
    expect(result.valid).toBe(true)
  })

  it('rejects a spoofed EPUB with wrong mimetype', async () => {
    const buf = buildZip([
      { name: 'mimetype', content: Buffer.from('application/zip', 'ascii') },
    ])
    const result = await validateFile(buf, 'book.epub', 'epub-to-mobi')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('File content does not match the expected document format.')
  })
})

// ---------------------------------------------------------------------------
// DjVu validation
// ---------------------------------------------------------------------------

describe('validateFile - DjVu', () => {
  it('accepts a valid single-page DJVU header', async () => {
    const buf = buildDjvuHeader('DJVU')
    const result = await validateFile(buf, 'scan.djvu', 'djvu-to-pdf')
    expect(result.valid).toBe(true)
  })

  it('accepts a valid multi-page DJVM header', async () => {
    const buf = buildDjvuHeader('DJVM')
    const result = await validateFile(buf, 'book.djvu', 'djvu-to-pdf')
    expect(result.valid).toBe(true)
  })

  it('rejects a truncated DjVu buffer (less than 16 bytes)', async () => {
    const buf = buildDjvuHeader('DJVU').subarray(0, 12)
    const result = await validateFile(buf, 'scan.djvu', 'djvu-to-pdf')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('File does not appear to be a valid DjVu document.')
  })

  it('rejects a DjVu buffer with wrong AT&T magic', async () => {
    const buf = buildDjvuHeader('DJVU')
    buf[0] = 0x00 // corrupt first byte
    const result = await validateFile(buf, 'scan.djvu', 'djvu-to-pdf')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('File does not appear to be a valid DjVu document.')
  })

  it('rejects a DjVu buffer with wrong chunk identifier', async () => {
    const buf = buildDjvuHeader('DJVU')
    // Overwrite the chunk bytes (12-15) with an invalid value
    Buffer.from('JUNK', 'ascii').copy(buf, 12)
    const result = await validateFile(buf, 'scan.djvu', 'djvu-to-pdf')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('File does not appear to be a valid DjVu document.')
  })

  it('rejects a non-DjVu buffer uploaded with a .djvu extension', async () => {
    const buf = Buffer.from('This is not a DjVu file at all.', 'ascii')
    // Pad to 16 bytes if needed
    const padded = buf.length < 16 ? Buffer.concat([buf, Buffer.alloc(16 - buf.length)]) : buf
    const result = await validateFile(padded, 'fake.djvu', 'djvu-to-pdf')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('File does not appear to be a valid DjVu document.')
  })
})

// ---------------------------------------------------------------------------
// Error message assertions
// ---------------------------------------------------------------------------

describe('validateFile - error messages', () => {
  it('reports "Unknown conversion type." for an unrecognised slug', async () => {
    const buf = Buffer.from('data', 'utf-8')
    const result = await validateFile(buf, 'doc.md', 'totally-unknown')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Unknown conversion type.')
  })

  it('reports "File is empty." for a zero-byte buffer', async () => {
    const result = await validateFile(Buffer.alloc(0), 'doc.md', 'markdown-to-pdf')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('File is empty.')
  })

  it('reports "File exceeds the 10MB size limit." for an oversize buffer', async () => {
    const result = await validateFile(Buffer.alloc(MAX_FILE_SIZE + 1), 'doc.md', 'markdown-to-pdf')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('File exceeds the 10MB size limit.')
  })

  it('reports "File is not valid UTF-8 text." for binary data in a text slot', async () => {
    const buf = Buffer.from([0x80, 0x81, 0x82])
    const result = await validateFile(buf, 'doc.md', 'markdown-to-pdf')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('File is not valid UTF-8 text.')
  })

  it('reports "Invalid file extension" when the extension does not match the conversion', async () => {
    const buf = Buffer.from('Hello', 'utf-8')
    const result = await validateFile(buf, 'doc.pdf', 'markdown-to-pdf')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/^Invalid file extension/)
  })

  it('reports "File does not appear to be a valid DjVu document." for a bad DjVu file', async () => {
    const buf = Buffer.alloc(16, 0x00)
    const result = await validateFile(buf, 'scan.djvu', 'djvu-to-pdf')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('File does not appear to be a valid DjVu document.')
  })

  it('reports "File content does not match the expected document format." for a spoofed ZIP', async () => {
    const buf = buildZip([{ name: 'random.txt', content: Buffer.from('hi', 'ascii') }])
    const result = await validateFile(buf, 'test.docx', 'docx-to-markdown')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('File content does not match the expected document format.')
  })
})
