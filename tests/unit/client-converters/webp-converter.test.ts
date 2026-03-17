import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface MockCanvasContext {
  fillStyle: string
  fillRect: ReturnType<typeof vi.fn>
  drawImage: ReturnType<typeof vi.fn>
  getImageData: ReturnType<typeof vi.fn>
  putImageData: ReturnType<typeof vi.fn>
}

interface MockCanvasElement {
  width: number
  height: number
  getContext: ReturnType<typeof vi.fn>
  toBlob: ReturnType<typeof vi.fn>
  context: MockCanvasContext
}

interface MockWebpBrowserEnvironment {
  canvases: MockCanvasElement[]
  setNextImageData: (imageData: ImageData) => void
  restore: () => void
}

const { mockEncode, mockDecode } = vi.hoisted(() => ({
  mockEncode: vi.fn(),
  mockDecode: vi.fn(),
}))

vi.mock('@jsquash/webp', () => ({
  encode: mockEncode,
  decode: mockDecode,
}))

describe('enhanced WebP converter', () => {
  let browser: MockWebpBrowserEnvironment

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    browser = installWebpBrowserEnvironment()
  })

  afterEach(() => {
    browser.restore()
  })

  it('encodes raster inputs to WebP with @jsquash/webp', async () => {
    const { createWebpConverter } = await import('~/lib/client-converters/webp-converter')
    const imageData = createMockImageData(10, 6)
    browser.setNextImageData(imageData)

    mockEncode.mockResolvedValueOnce(new Uint8Array([1, 2, 3, 4]).buffer)

    const converter = createWebpConverter({
      targetMimeType: 'image/webp',
      targetExtension: '.webp',
      defaultQuality: 0.9,
    })

    const result = await converter.convert({
      file: new File(['png'], 'source.png', { type: 'image/png' }),
    }, {
      quality: 0.82,
    })

    expect(mockEncode).toHaveBeenCalledOnce()
    expect(mockEncode).toHaveBeenCalledWith(
      imageData,
      expect.objectContaining({
        quality: 82,
        alpha_quality: 100,
      }),
    )
    expect(result.filename).toBe('source.webp')
    expect(result.mimeType).toBe('image/webp')
    expect(result.blob?.type).toBe('image/webp')
  })

  it('decodes WebP input before exporting to PNG', async () => {
    const { createWebpConverter } = await import('~/lib/client-converters/webp-converter')
    const decodedImageData = createMockImageData(7, 5)

    mockDecode.mockResolvedValueOnce(decodedImageData)

    const converter = createWebpConverter({
      targetMimeType: 'image/png',
      targetExtension: '.png',
    })

    const result = await converter.convert({
      file: new File([new Uint8Array([9, 8, 7])], 'source.webp', { type: 'image/webp' }),
    })

    const sourceCanvas = browser.canvases.find((canvas) => canvas.context.putImageData.mock.calls.length > 0)
    const outputCanvas = browser.canvases.at(-1)

    expect(mockDecode).toHaveBeenCalledOnce()
    expect(sourceCanvas?.context.putImageData).toHaveBeenCalledWith(decodedImageData, 0, 0)
    expect(outputCanvas?.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', undefined)
    expect(result.filename).toBe('source.png')
    expect(result.mimeType).toBe('image/png')
  })

  it('surfaces load failures with retry guidance so the UI can fall back to standard mode', async () => {
    const { createWebpConverter } = await import('~/lib/client-converters/webp-converter')
    browser.setNextImageData(createMockImageData(4, 4))

    const converter = createWebpConverter({
      targetMimeType: 'image/webp',
      targetExtension: '.webp',
    }, {
      loadCodec: () => Promise.reject(new Error('network failure')),
    })

    await expect(
      converter.convert({
        file: new File(['png'], 'source.png', { type: 'image/png' }),
      }),
    ).rejects.toThrow("Enhanced quality couldn't load. Retry or continue in Standard mode.")
  })
})

function createMockImageData(width = 2, height = 2): ImageData {
  return {
    data: new Uint8ClampedArray(width * height * 4).fill(255),
    width,
    height,
  } as unknown as ImageData
}

function installWebpBrowserEnvironment(): MockWebpBrowserEnvironment {
  const globalScope = globalThis as Record<string, unknown>
  const originalDocument = globalScope['document']
  const originalImage = globalScope['Image']
  const originalImageData = globalScope['ImageData']
  const urlObject = globalThis.URL as typeof URL & {
    createObjectURL?: (object: Blob | MediaSource) => string
    revokeObjectURL?: (url: string) => void
  }
  const originalCreateObjectURL = urlObject.createObjectURL
  const originalRevokeObjectURL = urlObject.revokeObjectURL

  const canvases: MockCanvasElement[] = []
  let nextImageData = createMockImageData(8, 6)

  const createObjectURL = vi.fn(() => 'blob:mock-webp-image')
  const revokeObjectURL = vi.fn()

  class MockImage {
    onload: ((event?: unknown) => void) | null = null
    onerror: ((event?: unknown) => void) | null = null
    width = nextImageData.width
    height = nextImageData.height
    naturalWidth = nextImageData.width
    naturalHeight = nextImageData.height
    decoding = 'async'

    set src(_value: string) {
      queueMicrotask(() => {
        this.width = nextImageData.width
        this.height = nextImageData.height
        this.naturalWidth = nextImageData.width
        this.naturalHeight = nextImageData.height
        this.onload?.()
      })
    }
  }

  class MockImageData {
    data: Uint8ClampedArray
    width: number
    height: number

    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data
      this.width = width
      this.height = height
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
        getImageData: vi.fn(() => nextImageData),
        putImageData: vi.fn(),
      }

      const canvas: MockCanvasElement = {
        width: 0,
        height: 0,
        getContext: vi.fn((kind: string) => (kind === '2d' ? context : null)),
        toBlob: vi.fn((callback: (blob: Blob | null) => void, type?: string) => {
          queueMicrotask(() => callback(new Blob(['converted'], { type: type ?? 'image/png' })))
        }),
        context,
      }

      canvases.push(canvas)
      return canvas
    }),
  }

  globalScope['document'] = document
  globalScope['Image'] = MockImage
  globalScope['ImageData'] = MockImageData
  urlObject.createObjectURL = createObjectURL
  urlObject.revokeObjectURL = revokeObjectURL

  return {
    canvases,
    setNextImageData(imageData: ImageData) {
      nextImageData = imageData
    },
    restore() {
      restoreGlobal(globalScope, 'document', originalDocument)
      restoreGlobal(globalScope, 'Image', originalImage)
      restoreGlobal(globalScope, 'ImageData', originalImageData)

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
