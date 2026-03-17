import { clamp, createAbortError, throwIfAborted } from './abort-utils'
import { createSvgPngConverter } from './svg-png'
import type {
  ClientConversionInput,
  ClientConversionOptions,
  ClientConversionResult,
  ClientConverter,
} from './types'

export interface CanvasConverterConfig {
  targetMimeType: string
  targetExtension: string
  defaultQuality?: number
}

const SUPPORTED_TARGET_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

const AVIF_DETECTION_DATA_URL = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A='

let avifDecodeSupportPromise: Promise<boolean> | undefined
let webpEncodeSupportPromise: Promise<boolean> | undefined

export async function isAvifDecodeSupported(): Promise<boolean> {
  if (!avifDecodeSupportPromise) {
    avifDecodeSupportPromise = detectAvifDecodeSupport()
  }

  return avifDecodeSupportPromise
}

export async function isCanvasWebpEncodeSupported(): Promise<boolean> {
  if (!webpEncodeSupportPromise) {
    webpEncodeSupportPromise = detectWebpEncodeSupport()
  }

  return webpEncodeSupportPromise
}

export function createCanvasConverter(
  config: CanvasConverterConfig,
): ClientConverter {
  const targetMimeType = normalizeImageMimeType(config.targetMimeType)
  const svgPngConverter = targetMimeType === 'image/png'
    ? createSvgPngConverter({ targetExtension: config.targetExtension })
    : undefined

  const isSupported = async (input?: ClientConversionInput) => {
    if (!hasCanvasBrowserSupport()) {
      return {
        supported: false,
        reason: 'This browser does not support Canvas-based image conversion.',
      }
    }

    if (!SUPPORTED_TARGET_MIME_TYPES.has(targetMimeType)) {
      return {
        supported: false,
        reason: `Canvas conversion does not support ${targetMimeType} output.`,
      }
    }

    if (input?.file && isSvgFile(input.file) && !svgPngConverter) {
      return {
        supported: false,
        reason: 'Standard SVG conversion is currently available only for PNG output.',
      }
    }

    if (input?.file && isAvifFile(input.file)) {
      const avifSupported = await isAvifDecodeSupported()
      if (!avifSupported) {
        return {
          supported: false,
          reason: 'This browser cannot decode AVIF images. Try Chrome 85+, Firefox 93+, Safari 16+, or Edge 85+.',
        }
      }
    }

    if (targetMimeType === 'image/webp') {
      const webpSupported = await isCanvasWebpEncodeSupported()
      if (!webpSupported) {
        return {
          supported: false,
          reason: 'This browser cannot export images as WebP with Canvas.',
        }
      }
    }

    return { supported: true }
  }

  return {
    isSupported,
    async convert(
      input: ClientConversionInput,
      options: ClientConversionOptions = {},
    ): Promise<ClientConversionResult> {
      const support = await isSupported(input)
      if (!support.supported) {
        throw new Error(support.reason ?? 'This browser cannot run the requested image conversion.')
      }

      if (input.file && isSvgFile(input.file)) {
        if (!svgPngConverter) {
          throw new Error('Standard SVG conversion is currently available only for PNG output.')
        }

        return svgPngConverter.convert(input, options)
      }

      const file = requireImageFile(input)

      options.onProgress?.(10)
      const image = await loadImageFromFile(file, options.signal)
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height

      if (width <= 0 || height <= 0) {
        throw new Error('Unable to determine the image dimensions for canvas conversion.')
      }

      options.onProgress?.(50)
      const canvas = createCanvas(width, height)
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('Canvas 2D rendering is unavailable in this browser.')
      }

      if (targetMimeType === 'image/jpeg') {
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, width, height)
      }

      context.drawImage(image, 0, 0)

      options.onProgress?.(80)
      const blob = await canvasToBlob(
        canvas,
        targetMimeType,
        getCanvasQuality(targetMimeType, options.quality ?? config.defaultQuality),
      )

      if (targetMimeType === 'image/webp' && blob.type !== 'image/webp') {
        throw new Error('This browser could not export the image as WebP.')
      }

      options.onProgress?.(100)

      return {
        kind: 'binary',
        blob,
        filename: buildOutputFilename(file.name ?? input.filename, config.targetExtension),
        mimeType: targetMimeType,
      }
    },
  }
}

function hasCanvasBrowserSupport(): boolean {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return false
  }

  if (typeof document.createElement !== 'function') {
    return false
  }

  const canvas = document.createElement('canvas')
  return typeof canvas.toBlob === 'function'
}

async function detectAvifDecodeSupport(): Promise<boolean> {
  if (typeof createImageBitmap !== 'function') {
    return false
  }

  try {
    const bitmap = await createImageBitmap(dataUrlToBlob(AVIF_DETECTION_DATA_URL))
    bitmap.close?.()
    return true
  } catch {
    return false
  }
}

async function detectWebpEncodeSupport(): Promise<boolean> {
  if (!hasCanvasBrowserSupport()) {
    return false
  }

  try {
    const canvas = createCanvas(1, 1)
    const blob = await canvasToBlob(canvas, 'image/webp', 0.8)
    return blob.type === 'image/webp'
  } catch {
    return false
  }
}

async function loadImageFromFile(
  file: File,
  signal?: AbortSignal,
): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file)

  try {
    return await loadImageFromSource(objectUrl, signal)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function loadImageFromSource(
  source: string,
  signal?: AbortSignal,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal)

    const image = new Image()
    let settled = false

    const cleanup = () => {
      image.onload = null
      image.onerror = null
      signal?.removeEventListener('abort', handleAbort)
    }

    const fail = (error: Error) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      reject(error)
    }

    const handleAbort = () => fail(createAbortError())

    image.onload = () => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      resolve(image)
    }

    image.onerror = () => fail(new Error('The browser could not decode the selected image.'))
    signal?.addEventListener('abort', handleAbort, { once: true })
    image.decoding = 'async'
    image.src = source
  })
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('Canvas export is not available in this browser.'))
      return
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas export returned no data.'))
        return
      }

      resolve(blob)
    }, type, quality)
  })
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function requireImageFile(input: ClientConversionInput): File {
  if (!input.file) {
    throw new Error('Image conversion requires an uploaded file.')
  }

  return input.file
}

function isAvifFile(file: File): boolean {
  const normalizedMimeType = normalizeImageMimeType(file.type)
  return normalizedMimeType === 'image/avif' || file.name.toLowerCase().endsWith('.avif')
}

function isSvgFile(file: File): boolean {
  const normalizedMimeType = normalizeImageMimeType(file.type)
  return normalizedMimeType === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
}

export function normalizeImageMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase().trim()
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized
}

function getCanvasQuality(
  targetMimeType: string,
  quality: number | undefined,
): number | undefined {
  if (quality == null || targetMimeType === 'image/png') {
    return undefined
  }

  return clamp(quality, 0, 1)
}

function buildOutputFilename(filename: string | undefined, extension: string): string {
  const fallback = `converted${extension}`
  if (!filename) {
    return fallback
  }

  const lastDot = filename.lastIndexOf('.')
  return `${lastDot > 0 ? filename.slice(0, lastDot) : filename}${extension}`
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [metadata, encoded] = dataUrl.split(',', 2)
  const mimeType = metadata.match(/^data:(.*?);base64$/i)?.[1] ?? 'application/octet-stream'
  const binary = atob(encoded)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new Blob([bytes], { type: mimeType })
}

