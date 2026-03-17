import { createAbortError, throwIfAborted } from './abort-utils'
import type {
  ClientConversionInput,
  ClientConversionOptions,
  ClientConversionResult,
  ClientConversionWarning,
  ClientConverter,
  ClientConverterSupport,
} from './types'

export interface SvgPngConverterConfig {
  targetExtension?: string
}

export interface SvgExternalAssetReference {
  kind: 'image' | 'style' | 'use'
  value: string
}

const EXTERNAL_HTTP_REFERENCE_PATTERN = /^(?:https?:)?\/\//i
const CSS_URL_PATTERN = /url\(\s*(['"]?)(?:(https?:)?\/\/[^'")\s]+)\1\s*\)/gi
const EXTERNAL_SVG_ASSET_WARNING =
  'This SVG references remote assets. External images, styles, or <use> targets may be omitted in the converted PNG.'

export function detectExternalSvgAssetReferences(svgMarkup: string): SvgExternalAssetReference[] {
  if (typeof DOMParser === 'undefined') {
    return []
  }

  try {
    const document = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml')
    if (document.querySelector('parsererror')) {
      return []
    }

    const references: SvgExternalAssetReference[] = []

    for (const element of Array.from(document.querySelectorAll('image,use'))) {
      const href = element.getAttribute('href') ?? element.getAttribute('xlink:href')
      if (href && EXTERNAL_HTTP_REFERENCE_PATTERN.test(href.trim())) {
        references.push({
          kind: element.tagName.toLowerCase() === 'image' ? 'image' : 'use',
          value: href.trim(),
        })
      }
    }

    const styleSources = [
      ...Array.from(document.querySelectorAll('style')).map((styleElement) => styleElement.textContent ?? ''),
      ...Array.from(document.querySelectorAll('[style]')).map((styledElement) => styledElement.getAttribute('style') ?? ''),
    ]

    for (const styleSource of styleSources) {
      for (const url of extractExternalStyleUrls(styleSource)) {
        references.push({
          kind: 'style',
          value: url,
        })
      }
    }

    return dedupeExternalReferences(references)
  } catch {
    return []
  }
}

export function createSvgPngConverter(
  config: SvgPngConverterConfig = {},
): ClientConverter {
  const targetExtension = config.targetExtension ?? '.png'

  const isSupported = (): Promise<ClientConverterSupport> => {
    if (!hasSvgPngBrowserSupport()) {
      return Promise.resolve({
        supported: false,
        reason: 'This browser does not support SVG to PNG conversion with Canvas.',
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
        throw new Error(support.reason ?? 'SVG to PNG conversion is not supported in this browser.')
      }

      const svgMarkup = await readSvgMarkup(input)
      const sourceFilename = input.file?.name ?? input.filename
      const references = detectExternalSvgAssetReferences(svgMarkup)
      const warnings = buildExternalAssetWarnings(references)
      const dataUrl = toSvgDataUrl(svgMarkup)

      options.onProgress?.(10)
      const image = await loadImageFromSource(dataUrl, options.signal)
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      if (width <= 0 || height <= 0) {
        throw new Error('Unable to determine the SVG dimensions for PNG export.')
      }

      options.onProgress?.(55)
      const canvas = createCanvas(width, height)
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('Canvas 2D rendering is unavailable in this browser.')
      }

      context.drawImage(image, 0, 0)

      options.onProgress?.(85)
      const blob = await canvasToBlob(canvas, 'image/png')
      options.onProgress?.(100)

      return {
        kind: 'binary',
        blob,
        filename: buildOutputFilename(sourceFilename, targetExtension),
        mimeType: 'image/png',
        warnings,
      }
    },
  }
}

function hasSvgPngBrowserSupport(): boolean {
  return typeof Image !== 'undefined'
    && typeof document !== 'undefined'
    && typeof document.createElement === 'function'
}

async function readSvgMarkup(input: ClientConversionInput): Promise<string> {
  if (typeof input.text === 'string' && input.text.length > 0) {
    return input.text
  }

  if (input.file) {
    return input.file.text()
  }

  throw new Error('SVG conversion requires SVG markup or an uploaded SVG file.')
}

function extractExternalStyleUrls(styleSource: string): string[] {
  const matches: string[] = []

  for (const match of styleSource.matchAll(CSS_URL_PATTERN)) {
    const [rawMatch] = match
    const url = rawMatch
      .slice(rawMatch.indexOf('(') + 1, rawMatch.lastIndexOf(')'))
      .trim()
      .replace(/^['"]|['"]$/g, '')

    if (EXTERNAL_HTTP_REFERENCE_PATTERN.test(url)) {
      matches.push(url)
    }
  }

  return matches
}

function dedupeExternalReferences(
  references: SvgExternalAssetReference[],
): SvgExternalAssetReference[] {
  const seen = new Set<string>()

  return references.filter((reference) => {
    const key = `${reference.kind}:${reference.value}`
    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function buildExternalAssetWarnings(
  references: SvgExternalAssetReference[],
): ClientConversionWarning[] | undefined {
  if (references.length === 0) {
    return undefined
  }

  return [{
    code: 'svg-external-assets',
    message: EXTERNAL_SVG_ASSET_WARNING,
    details: references.map((reference) => `${reference.kind}: ${reference.value}`),
  }]
}

function toSvgDataUrl(svgMarkup: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`
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

    image.onerror = () => fail(new Error('The browser could not render the uploaded SVG image.'))
    signal?.addEventListener('abort', handleAbort, { once: true })
    image.decoding = 'async'
    image.src = source
  })
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
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
    }, type)
  })
}

function buildOutputFilename(filename: string | undefined, extension: string): string {
  const fallback = `converted${extension}`
  if (!filename) {
    return fallback
  }

  const lastDot = filename.lastIndexOf('.')
  return `${lastDot > 0 ? filename.slice(0, lastDot) : filename}${extension}`
}

