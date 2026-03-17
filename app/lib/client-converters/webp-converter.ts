import type { EncodeOptions } from '@jsquash/webp/meta'
import { clamp, createAbortError, throwIfAborted } from './abort-utils'
import type {
  ClientConversionInput,
  ClientConversionOptions,
  ClientConversionResult,
  ClientConverter,
  ClientConverterSupport,
} from './types'
import { normalizeImageMimeType } from './canvas-converter'

export interface WebpConverterConfig {
  targetMimeType: string
  targetExtension: string
  defaultQuality?: number
}

export interface WebpCodecModule {
  encode(data: ImageData, options?: Partial<EncodeOptions>): Promise<ArrayBuffer>
  decode(buffer: ArrayBuffer): Promise<ImageData>
}

export interface WebpConverterDependencies {
  loadCodec?: () => Promise<WebpCodecModule>
}

const SUPPORTED_TARGET_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

let webpCodecPromise: Promise<WebpCodecModule> | undefined

export async function loadWebpCodec(): Promise<WebpCodecModule> {
  if (!webpCodecPromise) {
    webpCodecPromise = import('@jsquash/webp').then((module) => ({
      encode: module.encode,
      decode: module.decode,
    }))
  }

  try {
    return await webpCodecPromise
  } catch (error) {
    webpCodecPromise = undefined
    throw new Error("Enhanced quality couldn't load. Retry or continue in Standard mode.", {
      cause: error,
    })
  }
}

export function createWebpConverter(
  config: WebpConverterConfig,
  dependencies: WebpConverterDependencies = {},
): ClientConverter {
  const targetMimeType = normalizeImageMimeType(config.targetMimeType)
  const loadCodec = dependencies.loadCodec ?? loadWebpCodec

  const isSupported = (): Promise<ClientConverterSupport> => {
    if (!hasEnhancedWebpBrowserSupport()) {
      return Promise.resolve({
        supported: false,
        reason: 'This browser does not support enhanced WebP conversion.',
      })
    }

    if (!SUPPORTED_TARGET_MIME_TYPES.has(targetMimeType)) {
      return Promise.resolve({
        supported: false,
        reason: `Enhanced WebP conversion does not support ${targetMimeType} output.`,
      })
    }

    return Promise.resolve({ supported: true })
  }

  return {
    isSupported,
    async convert(
      input: ClientConversionInput,
      options: ClientConversionOptions = {},
    ): Promise<ClientConversionResult> {
      const support = await isSupported()
      if (!support.supported) {
        throw new Error(support.reason ?? 'This browser cannot run enhanced WebP conversion.')
      }

      const file = requireImageFile(input)
      const inputMimeType = normalizeImageMimeType(file.type)
      const inputIsWebp = inputMimeType === 'image/webp' || file.name.toLowerCase().endsWith('.webp')
      const targetIsWebp = targetMimeType === 'image/webp'

      if (!inputIsWebp && !targetIsWebp) {
        throw new Error('Enhanced WebP conversion only supports workflows that read or write WebP images.')
      }

      options.onProgress?.(10)

      let imageData: ImageData
      if (inputIsWebp) {
        const codec = await getCodec(loadCodec)
        imageData = await codec.decode(await file.arrayBuffer())
      } else {
        imageData = await fileToImageData(file, options.signal)
      }

      options.onProgress?.(65)

      let blob: Blob
      if (targetIsWebp) {
        const codec = await getCodec(loadCodec)
        const encoded = await codec.encode(
          imageData,
          buildWebpEncodeOptions(options.quality ?? config.defaultQuality),
        )

        blob = new Blob([encoded], { type: 'image/webp' })
      } else {
        blob = await imageDataToBlob(
          imageData,
          targetMimeType,
          getCanvasQuality(targetMimeType, options.quality ?? config.defaultQuality),
        )
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

function hasEnhancedWebpBrowserSupport(): boolean {
  return typeof Image !== 'undefined'
    && typeof ImageData !== 'undefined'
    && typeof document !== 'undefined'
    && typeof document.createElement === 'function'
}

async function getCodec(
  loadCodec: () => Promise<WebpCodecModule>,
): Promise<WebpCodecModule> {
  try {
    return await loadCodec()
  } catch (error) {
    if (error instanceof Error && error.message.includes('Retry or continue in Standard mode')) {
      throw error
    }

    throw new Error("Enhanced quality couldn't load. Retry or continue in Standard mode.", {
      cause: error,
    })
  }
}

async function fileToImageData(
  file: File,
  signal?: AbortSignal,
): Promise<ImageData> {
  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await loadImageFromSource(objectUrl, signal)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height

    if (width <= 0 || height <= 0) {
      throw new Error('Unable to determine the image dimensions for enhanced WebP conversion.')
    }

    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas 2D rendering is unavailable in this browser.')
    }

    context.drawImage(image, 0, 0)

    const imageData = context.getImageData(0, 0, width, height)
    if (!imageData) {
      throw new Error('Unable to read image pixels from Canvas.')
    }

    return imageData
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function imageDataToBlob(
  imageData: ImageData,
  targetMimeType: string,
  quality?: number,
): Promise<Blob> {
  const sourceCanvas = createCanvas(imageData.width, imageData.height)
  const sourceContext = sourceCanvas.getContext('2d')
  if (!sourceContext) {
    throw new Error('Canvas 2D rendering is unavailable in this browser.')
  }

  sourceContext.putImageData(imageData, 0, 0)

  const outputCanvas = createCanvas(imageData.width, imageData.height)
  const outputContext = outputCanvas.getContext('2d')
  if (!outputContext) {
    throw new Error('Canvas 2D rendering is unavailable in this browser.')
  }

  if (targetMimeType === 'image/jpeg') {
    outputContext.fillStyle = '#ffffff'
    outputContext.fillRect(0, 0, imageData.width, imageData.height)
  }

  outputContext.drawImage(sourceCanvas, 0, 0)

  return canvasToBlob(outputCanvas, targetMimeType, quality)
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

function buildWebpEncodeOptions(quality: number | undefined): Partial<EncodeOptions> {
  const normalizedQuality = Math.round(clamp((quality ?? 0.9) * 100, 0, 100))

  return {
    quality: normalizedQuality,
    alpha_quality: 100,
    method: 4,
  }
}

function requireImageFile(input: ClientConversionInput): File {
  if (!input.file) {
    throw new Error('Enhanced WebP conversion requires an uploaded file.')
  }

  return input.file
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

