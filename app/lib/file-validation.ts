import path from 'node:path'
import { fileTypeFromBuffer } from 'file-type'
import { getConversionBySlug } from '~/lib/conversions'

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export interface ValidationResult {
  valid: boolean
  error?: string
}

const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.tex', '.html', '.htm'])
const ZIP_EOCD_SIGNATURE = 0x06054b50
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const ZIP_EOCD_MIN_SIZE = 22
const ZIP_EOCD_MAX_SEARCH = 65_557

interface ZipEntry {
  name: string
  compressionMethod: number
  compressedSize: number
  localHeaderOffset: number
}

function isValidDjvu(buffer: Buffer | Uint8Array): boolean {
  if (buffer.byteLength < 16) return false
  // Bytes 0-3: AT&T (hex 41 54 26 54)
  // Bytes 4-7: FORM (hex 46 4F 52 4D)
  if (
    buffer[0] !== 0x41 || buffer[1] !== 0x54 ||
    buffer[2] !== 0x26 || buffer[3] !== 0x54 ||
    buffer[4] !== 0x46 || buffer[5] !== 0x4f ||
    buffer[6] !== 0x52 || buffer[7] !== 0x4d
  ) {
    return false
  }
  // Bytes 12-15: DJVU (single-page) or DJVM (multi-page)
  const chunk = String.fromCharCode(buffer[12], buffer[13], buffer[14], buffer[15])
  return chunk === 'DJVU' || chunk === 'DJVM'
}

function isValidUtf8(buffer: Buffer | Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return true
  } catch {
    return false
  }
}

function getDataView(buffer: Buffer | Uint8Array): DataView {
  return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
}

function decodeText(buffer: Buffer | Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
}

function parseZipEntries(buffer: Buffer | Uint8Array): ZipEntry[] | undefined {
  const view = getDataView(buffer)
  const searchStart = Math.max(0, buffer.byteLength - ZIP_EOCD_MAX_SEARCH)
  let eocdOffset = -1

  for (let offset = buffer.byteLength - ZIP_EOCD_MIN_SIZE; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_EOCD_SIGNATURE) {
      eocdOffset = offset
      break
    }
  }

  if (eocdOffset === -1) return undefined

  const entryCount = view.getUint16(eocdOffset + 10, true)
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true)
  const entries: ZipEntry[] = []
  const filenameDecoder = new TextDecoder('utf-8')
  let offset = centralDirectoryOffset

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.byteLength) return undefined
    if (view.getUint32(offset, true) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) return undefined

    const compressionMethod = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const filenameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localHeaderOffset = view.getUint32(offset + 42, true)
    const filenameStart = offset + 46
    const filenameEnd = filenameStart + filenameLength

    if (filenameEnd > buffer.byteLength) return undefined

    entries.push({
      name: filenameDecoder.decode(buffer.subarray(filenameStart, filenameEnd)),
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    })

    offset = filenameEnd + extraLength + commentLength
  }

  return entries
}

function readStoredZipEntryText(
  buffer: Buffer | Uint8Array,
  entry: ZipEntry,
): string | undefined {
  if (entry.compressionMethod !== 0) return undefined

  const view = getDataView(buffer)
  const headerOffset = entry.localHeaderOffset
  if (headerOffset + 30 > buffer.byteLength) return undefined
  if (view.getUint32(headerOffset, true) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) return undefined

  const filenameLength = view.getUint16(headerOffset + 26, true)
  const extraLength = view.getUint16(headerOffset + 28, true)
  const dataStart = headerOffset + 30 + filenameLength + extraLength
  const dataEnd = dataStart + entry.compressedSize

  if (dataEnd > buffer.byteLength) return undefined

  try {
    return decodeText(buffer.subarray(dataStart, dataEnd))
  } catch {
    return undefined
  }
}

function isExpectedZipContainer(
  buffer: Buffer | Uint8Array,
  ext: string,
): boolean {
  const entries = parseZipEntries(buffer)
  if (!entries) return false

  if (ext === '.docx') {
    return entries.some((entry) => entry.name === '[Content_Types].xml')
      && entries.some((entry) => entry.name.startsWith('word/'))
  }

  const mimetypeEntry = entries.find((entry) => entry.name === 'mimetype')
  if (!mimetypeEntry) return false

  const mimetype = readStoredZipEntryText(buffer, mimetypeEntry)
  if (!mimetype) return false

  if (ext === '.odt') {
    return mimetype === 'application/vnd.oasis.opendocument.text'
  }

  if (ext === '.epub') {
    return mimetype === 'application/epub+zip'
  }

  return false
}

export async function validateFile(
  buffer: Buffer | Uint8Array,
  declaredFilename: string,
  conversionType: string,
): Promise<ValidationResult> {
  const conversion = getConversionBySlug(conversionType)
  if (!conversion) {
    return { valid: false, error: 'Unknown conversion type.' }
  }

  if (buffer.byteLength === 0) {
    return { valid: false, error: 'File is empty.' }
  }

  if (buffer.byteLength > MAX_FILE_SIZE) {
    return { valid: false, error: 'File exceeds the 10MB size limit.' }
  }

  const ext = path.extname(declaredFilename).toLowerCase()
  if (!conversion.sourceExtensions.includes(ext)) {
    return { valid: false, error: `Invalid file extension "${ext}". Expected: ${conversion.sourceExtensions.join(', ')}` }
  }

  // Text formats: skip magic bytes, validate UTF-8
  if (TEXT_EXTENSIONS.has(ext)) {
    if (!isValidUtf8(buffer)) {
      return { valid: false, error: 'File is not valid UTF-8 text.' }
    }
    return { valid: true }
  }

  // DjVu: custom magic byte check
  if (ext === '.djvu') {
    if (!isValidDjvu(buffer)) {
      return { valid: false, error: 'File does not appear to be a valid DjVu document.' }
    }
    return { valid: true }
  }

  // ZIP-based binary formats (.docx, .epub, .odt): use file-type
  const detected = await fileTypeFromBuffer(buffer)
  if (!detected) {
    return { valid: false, error: 'Unable to detect file type. The file may be corrupted.' }
  }

  const isExpectedMime = conversion.sourceMimeTypes.includes(detected.mime)
  const isZip = detected.mime === 'application/zip'
  if (!isExpectedMime && !isZip) {
    return { valid: false, error: `File content does not match expected type. Detected: ${detected.mime}` }
  }

  if (!isExpectedZipContainer(buffer, ext)) {
    return { valid: false, error: 'File content does not match the expected document format.' }
  }

  return { valid: true }
}
