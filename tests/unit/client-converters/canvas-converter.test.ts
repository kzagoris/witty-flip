import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface MockCanvasContext {
  fillStyle: string
  fillRect: ReturnType<typeof vi.fn>
  drawImage: ReturnType<typeof vi.fn>
}

interface MockCanvasElement {
  width: number
  height: number
  getContext: ReturnType<typeof vi.fn>
  toBlob: ReturnType<typeof vi.fn>
  context: MockCanvasContext
}

interface MockCanvasBrowserEnvironment {
  canvases: MockCanvasElement[]
  createImageBitmap: ReturnType<typeof vi.fn>
  setCanvasBlobTypeOverride: (mimeType: string | undefined) => void
  setNextImageSize: (width: number, height: number) => void
  restore: () => void
}

describe('canvas converter', () => {
  let browser: MockCanvasBrowserEnvironment

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    browser = installCanvasBrowserEnvironment()
  })

  afterEach(() => {
    browser.restore()
  })

  it('converts raster images with canvas export and preserves output metadata', async () => {
    const { createCanvasConverter } = await import('~/lib/client-converters/canvas-converter')

    browser.setNextImageSize(12, 9)

    const converter = createCanvasConverter({
      targetMimeType: 'image/jpeg',
      targetExtension: '.jpg',
      defaultQuality: 0.9,
    })

    const result = await converter.convert({
      file: new File(['png-bytes'], 'sample.png', { type: 'image/png' }),
    }, {
      quality: 0.42,
    })

    const outputCanvas = browser.canvases.at(-1)

    expect(result.kind).toBe('binary')
    expect(result.filename).toBe('sample.jpg')
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.blob).toBeInstanceOf(Blob)
    expect(outputCanvas?.context.fillRect).toHaveBeenCalledWith(0, 0, 12, 9)
    expect(outputCanvas?.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.42)
  })

  it('reports AVIF decode support failures with a browser guidance message', async () => {
    const { createCanvasConverter } = await import('~/lib/client-converters/canvas-converter')

    browser.createImageBitmap.mockRejectedValueOnce(new Error('unsupported'))

    const converter = createCanvasConverter({
      targetMimeType: 'image/png',
      targetExtension: '.png',
    })

    const support = await converter.isSupported({
      file: new File(['avif-bytes'], 'photo.avif', { type: 'image/avif' }),
    })

    expect(browser.createImageBitmap).toHaveBeenCalledOnce()
    expect(support.supported).toBe(false)
    expect(support.reason).toContain('AVIF')
    expect(support.reason).toContain('Chrome 85+')
  })

  it('reports WebP export as unsupported when canvas falls back to another blob type', async () => {
    const { createCanvasConverter } = await import('~/lib/client-converters/canvas-converter')

    browser.setCanvasBlobTypeOverride('image/png')

    const converter = createCanvasConverter({
      targetMimeType: 'image/webp',
      targetExtension: '.webp',
    })

    const support = await converter.isSupported({
      file: new File(['png-bytes'], 'source.png', { type: 'image/png' }),
    })

    expect(support.supported).toBe(false)
    expect(support.reason).toContain('WebP')
  })

  it('routes SVG conversions through the SVG helper and returns non-blocking external asset warnings', async () => {
    const { createCanvasConverter } = await import('~/lib/client-converters/canvas-converter')

    browser.setNextImageSize(16, 10)

    const converter = createCanvasConverter({
      targetMimeType: 'image/png',
      targetExtension: '.png',
    })

    const svgMarkup = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="10">
        <style>.bg { fill: url(https://cdn.example.com/pattern.png); }</style>
        <image href="https://cdn.example.com/image.png" x="0" y="0" width="16" height="10" />
        <use href="//cdn.example.com/sprite.svg#shape" />
      </svg>
    `

    const result = await converter.convert({
      file: new File([svgMarkup], 'diagram.svg', { type: 'image/svg+xml' }),
    })

    expect(result.filename).toBe('diagram.png')
    expect(result.mimeType).toBe('image/png')
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'svg-external-assets',
      }),
    ])
  })
})

function installCanvasBrowserEnvironment(): MockCanvasBrowserEnvironment {
  const globalScope = globalThis as Record<string, unknown>
  const originalDocument = globalScope['document']
  const originalImage = globalScope['Image']
  const originalDomParser = globalScope['DOMParser']
  const originalCreateImageBitmap = globalScope['createImageBitmap']
  const originalAtob = globalScope['atob']
  const urlObject = globalThis.URL as typeof URL & {
    createObjectURL?: (object: Blob | MediaSource) => string
    revokeObjectURL?: (url: string) => void
  }
  const originalCreateObjectURL = urlObject.createObjectURL
  const originalRevokeObjectURL = urlObject.revokeObjectURL

  const canvases: MockCanvasElement[] = []
  let nextImageWidth = 8
  let nextImageHeight = 6
  let canvasBlobTypeOverride: string | undefined

  const createImageBitmap = vi.fn(() => Promise.resolve({ close: vi.fn() }))
  const createObjectURL = vi.fn(() => 'blob:mock-image')
  const revokeObjectURL = vi.fn()

  class MockImage {
    onload: ((event?: unknown) => void) | null = null
    onerror: ((event?: unknown) => void) | null = null
    width = nextImageWidth
    height = nextImageHeight
    naturalWidth = nextImageWidth
    naturalHeight = nextImageHeight
    decoding = 'async'

    set src(_value: string) {
      queueMicrotask(() => {
        this.width = nextImageWidth
        this.height = nextImageHeight
        this.naturalWidth = nextImageWidth
        this.naturalHeight = nextImageHeight
        this.onload?.()
      })
    }
  }

  class MockDOMParser {
    parseFromString(markup: string) {
      return {
        querySelector: () => null,
        querySelectorAll: (selector: string) => querySelectorAll(markup, selector),
      }
    }
  }

  const document = {
    createElement: vi.fn((tagName: string) => {
      if (tagName !== 'canvas') {
        return { tagName }
      }

      const context: MockCanvasContext = {
        fillStyle: '#000000',
        fillRect: vi.fn(),
        drawImage: vi.fn(),
      }

      const canvas: MockCanvasElement = {
        width: 0,
        height: 0,
        getContext: vi.fn((kind: string) => (kind === '2d' ? context : null)),
        toBlob: vi.fn((callback: (blob: Blob | null) => void, type?: string) => {
          const blobType = canvasBlobTypeOverride ?? type ?? 'image/png'
          queueMicrotask(() => callback(new Blob(['converted'], { type: blobType })))
        }),
        context,
      }

      canvases.push(canvas)
      return canvas
    }),
  }

  globalScope['document'] = document
  globalScope['Image'] = MockImage
  globalScope['DOMParser'] = MockDOMParser
  globalScope['createImageBitmap'] = createImageBitmap

  if (typeof originalAtob !== 'function') {
    globalScope['atob'] = (value: string) => Buffer.from(value, 'base64').toString('binary')
  }

  urlObject.createObjectURL = createObjectURL
  urlObject.revokeObjectURL = revokeObjectURL

  return {
    canvases,
    createImageBitmap,
    setCanvasBlobTypeOverride(mimeType: string | undefined) {
      canvasBlobTypeOverride = mimeType
    },
    setNextImageSize(width: number, height: number) {
      nextImageWidth = width
      nextImageHeight = height
    },
    restore() {
      restoreGlobal(globalScope, 'document', originalDocument)
      restoreGlobal(globalScope, 'Image', originalImage)
      restoreGlobal(globalScope, 'DOMParser', originalDomParser)
      restoreGlobal(globalScope, 'createImageBitmap', originalCreateImageBitmap)
      restoreGlobal(globalScope, 'atob', originalAtob)

      if (originalCreateObjectURL === undefined) {
        delete (urlObject as { createObjectURL?: (object: Blob | MediaSource) => string }).createObjectURL
      } else {
        urlObject.createObjectURL = originalCreateObjectURL
      }

      if (originalRevokeObjectURL === undefined) {
        delete (urlObject as { revokeObjectURL?: (url: string) => void }).revokeObjectURL
      } else {
        urlObject.revokeObjectURL = originalRevokeObjectURL
      }
    },
  }
}

function querySelectorAll(markup: string, selector: string): Array<{
  tagName: string
  textContent?: string
  getAttribute: (name: string) => string | null
}> {
  if (selector === 'image,use') {
    return [
      ...extractElements(markup, 'image'),
      ...extractElements(markup, 'use'),
    ]
  }

  if (selector === 'style') {
    return [...markup.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => ({
      tagName: 'style',
      textContent: match[1] ?? '',
      getAttribute: () => null,
    }))
  }

  if (selector === '[style]') {
    return [...markup.matchAll(/<([a-z0-9:-]+)\b([^>]*)\bstyle\s*=\s*["']([^"']*)["'][^>]*>/gi)].map((match) =>
      createElement(match[1] ?? 'element', match[2] ?? '', match[3] ?? ''),
    )
  }

  return []
}

function extractElements(markup: string, tagName: string) {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>`, 'gi')
  return [...markup.matchAll(pattern)].map((match) => createElement(tagName, match[1] ?? ''))
}

function createElement(tagName: string, attributeSource: string, forcedStyleValue?: string) {
  const attributes = new Map<string, string>()

  for (const match of attributeSource.matchAll(/([a-z0-9:-]+)\s*=\s*["']([^"']*)["']/gi)) {
    attributes.set(match[1].toLowerCase(), match[2])
  }

  if (forcedStyleValue) {
    attributes.set('style', forcedStyleValue)
  }

  return {
    tagName,
    getAttribute(name: string) {
      return attributes.get(name.toLowerCase()) ?? null
    },
  }
}

function restoreGlobal(
  globalScope: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value === undefined) {
    delete globalScope[key]
    return
  }

  globalScope[key] = value
}
