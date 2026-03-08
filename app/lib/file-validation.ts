import path from 'node:path'
import { fileTypeFromBuffer } from 'file-type'
import { getConversionBySlug } from '~/lib/conversions'

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export interface ValidationResult {
  valid: boolean
  error?: string
}

const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.tex', '.html', '.htm'])

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

  return { valid: true }
}
