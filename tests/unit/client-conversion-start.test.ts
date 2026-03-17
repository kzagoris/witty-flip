import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'

import type * as SchemaModule from '~/lib/db/schema'
import type { ClientConversionType } from '~/lib/conversions'

const { mockGetClientConversionBySlug } = vi.hoisted(() => ({
  mockGetClientConversionBySlug: vi.fn(),
}))

vi.mock('~/lib/conversions', async () => {
  const actual = await vi.importActual<typeof import('~/lib/conversions')>('~/lib/conversions')
  return {
    ...actual,
    getClientConversionBySlug: mockGetClientConversionBySlug,
  }
})

vi.mock('~/lib/server-runtime', () => ({
  initializeServerRuntime: vi.fn(),
}))

type DbType = Awaited<ReturnType<typeof setupTestDb>>['db']

function createMockClientConversion(): ClientConversionType {
  return {
    slug: 'png-to-jpg',
    category: 'image',
    processingMode: 'client',
    sourceFormat: 'png',
    targetFormat: 'jpg',
    sourceExtensions: ['.png'],
    sourceMimeTypes: ['image/png'],
    targetExtension: '.jpg',
    targetMimeType: 'image/jpeg',
    formatColor: '#2563eb',
    seo: {
      title: 'PNG to JPG',
      description: 'Convert PNG to JPG',
      h1: 'PNG to JPG',
      keywords: ['png to jpg'],
    },
    seoContent: '',
    faq: [],
    relatedConversions: [],
    clientConverter: 'canvas',
  }
}

describe('processClientConversionStart', () => {
  let db: DbType
  let schema: typeof SchemaModule

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    const sandbox = createTestSandbox()
    const setup = await setupTestDb(sandbox)
    db = setup.db
    schema = setup.schema

    mockGetClientConversionBySlug.mockImplementation((slug: string) =>
      slug === 'png-to-jpg' ? createMockClientConversion() : undefined)
  })

  it('creates a reserved attempt, stores only the token hash, and reserves a free slot', async () => {
    const { hashClientAttemptToken } = await import('~/lib/client-conversion-attempts')
    const { processClientConversionStart } = await import('~/server/api/client-conversion-start')

    const result = await processClientConversionStart({
      conversionSlug: 'png-to-jpg',
      originalFilename: 'input.png',
      fileSizeBytes: 1234,
      inputMode: 'file',
    }, '127.0.0.1')

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      allowed: true,
      processingMode: 'client',
      status: 'reserved',
      remainingFreeAfterReservation: 1,
    })

    if (!('allowed' in result.body) || !result.body.allowed) {
      throw new Error('Expected an allowed client conversion start response.')
    }

    const attempt = await db.query.clientConversionAttempts.findFirst({
      where: eq(schema.clientConversionAttempts.id, result.body.attemptId),
    })

    expect(attempt).toMatchObject({
      id: result.body.attemptId,
      conversionType: 'png-to-jpg',
      category: 'image',
      inputMode: 'file',
      originalFilename: 'input.png',
      inputSizeBytes: 1234,
      status: 'reserved',
      tokenHash: hashClientAttemptToken(result.body.token),
      recoveryToken: null,
    })

    const rateLimit = await db.query.rateLimits.findFirst({
      where: and(
        eq(schema.rateLimits.ipAddress, '127.0.0.1'),
        eq(schema.rateLimits.date, attempt!.rateLimitDate!),
      ),
    })

    expect(rateLimit).toMatchObject({
      freeConversionCount: 0,
      reservedFreeSlots: 1,
    })
  })

  it('creates a payment_required attempt when the free quota is exhausted', async () => {
    const today = new Date().toISOString().slice(0, 10)
    await db.insert(schema.rateLimits).values({
      ipAddress: '127.0.0.1',
      date: today,
      freeConversionCount: 2,
      reservedFreeSlots: 0,
    })

    const { processClientConversionStart } = await import('~/server/api/client-conversion-start')
    const result = await processClientConversionStart({
      conversionSlug: 'png-to-jpg',
      inputMode: 'paste',
    }, '127.0.0.1')

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      allowed: false,
      requiresPayment: true,
      processingMode: 'client',
      status: 'payment_required',
    })

    if (!('allowed' in result.body) || result.body.allowed) {
      throw new Error('Expected a payment_required client conversion start response.')
    }

    const attempt = await db.query.clientConversionAttempts.findFirst({
      where: eq(schema.clientConversionAttempts.id, result.body.attemptId),
    })

    expect(attempt).toMatchObject({
      id: result.body.attemptId,
      status: 'payment_required',
      inputMode: 'paste',
      rateLimitDate: null,
    })
  })

  it('rejects unknown client conversion slugs', async () => {
    const { processClientConversionStart } = await import('~/server/api/client-conversion-start')
    const result = await processClientConversionStart({
      conversionSlug: 'unknown-slug',
      inputMode: 'file',
    }, '127.0.0.1')

    expect(result.status).toBe(400)
    expect(result.body).toMatchObject({
      error: 'invalid_conversion_type',
    })
  })

  it('rejects invalid file size metadata', async () => {
    const { processClientConversionStart } = await import('~/server/api/client-conversion-start')
    const result = await processClientConversionStart({
      conversionSlug: 'png-to-jpg',
      inputMode: 'file',
      fileSizeBytes: -1,
    }, '127.0.0.1')

    expect(result.status).toBe(400)
    expect(result.body).toMatchObject({
      error: 'invalid_file_size',
    })
  })
})
