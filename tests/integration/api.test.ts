import { rmSync, writeFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'
import { createTestApp } from '../helpers/create-test-app'

import type { TestApp } from '../helpers/create-test-app'
import type { TestSandbox } from '../helpers/test-env'
import type { ConvertResult, Converter } from '~/lib/converters'

function expectRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Expected an object response body.')
  }

  return value as Record<string, unknown>
}

function getString(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  if (typeof value !== 'string') {
    throw new Error(`Expected "${key}" to be a string.`)
  }

  return value
}

function getNumber(body: Record<string, unknown>, key: string): number {
  const value = body[key]
  if (typeof value !== 'number') {
    throw new Error(`Expected "${key}" to be a number.`)
  }

  return value
}

describe('Phase 3 API integration', () => {
  let sandbox: TestSandbox
  let app: TestApp
  let db: Awaited<ReturnType<typeof setupTestDb>>['db']
  let schema: Awaited<ReturnType<typeof setupTestDb>>['schema']
  let registerConverter: (name: string, converter: Converter) => void

  beforeEach(async () => {
    vi.resetModules()
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret'
    process.env.BASE_URL = 'http://localhost:3000'

    sandbox = createTestSandbox()
    const setup = await setupTestDb(sandbox)
    db = setup.db
    schema = setup.schema

    app = await createTestApp()

    const { initializeServerRuntime } = await import('~/lib/server-runtime')
    initializeServerRuntime()

    const convertersModule = await import('~/lib/converters')
    registerConverter = convertersModule.registerConverter
  })

  afterEach(async () => {
    await app.close()
  })

  async function waitForTerminalStatus(fileId: string) {
    const deadline = Date.now() + 4_000

    while (Date.now() < deadline) {
      const response = await app.request.get(`/api/conversion/${fileId}/status`)
      const body = expectRecord(response.body as unknown)
      const status = getString(body, 'status')
      if (status === 'completed' || status === 'failed' || status === 'timeout' || status === 'expired') {
        return response
      }

      await new Promise<void>(resolve => setTimeout(resolve, 25))
    }

    throw new Error(`Timed out waiting for terminal status for ${fileId}`)
  }

  it('handles upload -> convert -> status -> download', async () => {
    registerConverter('pandoc', {
      convert: (_inputPath, outputPath) => {
        writeFileSync(outputPath, 'PDF DATA')
        return Promise.resolve({
          success: true,
          outputPath,
          exitCode: 0,
          durationMs: 12,
        } satisfies ConvertResult)
      },
    })

    const upload = await app.request
      .post('/api/upload')
      .field('conversionType', 'markdown-to-pdf')
      .attach('file', Buffer.from('# Hello\n'), 'hello.md')
    const uploadBody = expectRecord(upload.body as unknown)

    expect(upload.status).toBe(200)
    expect(getString(uploadBody, 'status')).toBe('uploaded')
    const fileId = getString(uploadBody, 'fileId')

    const convert = await app.request
      .post('/api/convert')
      .send({ fileId })
    const convertBody = expectRecord(convert.body as unknown)

    expect(convert.status).toBe(200)
    expect(getString(convertBody, 'status')).toBe('queued')

    const completed = await waitForTerminalStatus(fileId)
    const completedBody = expectRecord(completed.body as unknown)
    expect(completed.status).toBe(200)
    expect(getString(completedBody, 'status')).toBe('completed')
    expect(getNumber(completedBody, 'progress')).toBe(100)
    expect(getString(completedBody, 'downloadUrl')).toBe(`/api/download/${fileId}`)

    const download = await app.request.get(getString(completedBody, 'downloadUrl'))
    expect(download.status).toBe(200)
    expect(download.headers['content-disposition']).toContain('attachment;')
    const downloadBody = download.body as unknown
    expect(Buffer.isBuffer(downloadBody)).toBe(true)
    const downloadBuffer = downloadBody as Buffer
    expect(downloadBuffer.toString('utf-8')).toBe('PDF DATA')
  })

  it('returns payment_required once the free quota is exhausted', async () => {
    const today = new Date().toISOString().slice(0, 10)
    await db.insert(schema.rateLimits).values({
      ipAddress: '127.0.0.1',
      date: today,
      freeConversionCount: 2,
      reservedFreeSlots: 0,
    })

    const upload = await app.request
      .post('/api/upload')
      .field('conversionType', 'markdown-to-pdf')
      .attach('file', Buffer.from('# Hello\n'), 'hello.md')
    const uploadBody = expectRecord(upload.body as unknown)
    const fileId = getString(uploadBody, 'fileId')

    const convert = await app.request
      .post('/api/convert')
      .send({ fileId })
    const convertBody = expectRecord(convert.body as unknown)

    expect(convert.status).toBe(402)
    expect(getString(convertBody, 'error')).toBe('payment_required')
    expect(getString(convertBody, 'status')).toBe('payment_required')

    const conversion = await db.query.conversions.findFirst({
      where: eq(schema.conversions.id, fileId),
    })
    expect(conversion?.status).toBe('payment_required')
  })

  it('resolves trusted proxy headers consistently', async () => {
    const today = new Date().toISOString().slice(0, 10)
    await db.insert(schema.rateLimits).values({
      ipAddress: '203.0.113.50',
      date: today,
      freeConversionCount: 1,
      reservedFreeSlots: 0,
    })

    const trusted = await app.request
      .get('/api/rate-limit-status')
      .set('x-test-peer-ip', '127.0.0.1')
      .set('x-forwarded-for', '203.0.113.50')
    const trustedBody = expectRecord(trusted.body as unknown)

    expect(trusted.status).toBe(200)
    expect(getNumber(trustedBody, 'remaining')).toBe(1)

    const untrusted = await app.request
      .get('/api/rate-limit-status')
      .set('x-test-peer-ip', '198.51.100.9')
      .set('x-forwarded-for', '203.0.113.50')
    const untrustedBody = expectRecord(untrusted.body as unknown)

    expect(untrusted.status).toBe(200)
    expect(getNumber(untrustedBody, 'remaining')).toBe(2)
  })

  it('returns 410 for expired downloads', async () => {
    registerConverter('pandoc', {
      convert: (_inputPath, outputPath) => {
        writeFileSync(outputPath, 'PDF DATA')
        return Promise.resolve({
          success: true,
          outputPath,
          exitCode: 0,
          durationMs: 12,
        } satisfies ConvertResult)
      },
    })

    const upload = await app.request
      .post('/api/upload')
      .field('conversionType', 'markdown-to-pdf')
      .attach('file', Buffer.from('# Hello\n'), 'hello.md')
    const uploadBody = expectRecord(upload.body as unknown)
    const fileId = getString(uploadBody, 'fileId')

    await app.request.post('/api/convert').send({ fileId })
    await waitForTerminalStatus(fileId)

    await db
      .update(schema.conversions)
      .set({
        status: 'completed',
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      })
      .where(eq(schema.conversions.id, fileId))

    const download = await app.request.get(`/api/download/${fileId}`)
    expect(download.status).toBe(410)

    const conversion = await db.query.conversions.findFirst({
      where: eq(schema.conversions.id, fileId),
    })
    expect(conversion?.status).toBe('expired')
  })

  it('marks missing artifacts as failed on download attempts', async () => {
    registerConverter('pandoc', {
      convert: (_inputPath, outputPath) => {
        writeFileSync(outputPath, 'PDF DATA')
        return Promise.resolve({
          success: true,
          outputPath,
          exitCode: 0,
          durationMs: 12,
        } satisfies ConvertResult)
      },
    })

    const upload = await app.request
      .post('/api/upload')
      .field('conversionType', 'markdown-to-pdf')
      .attach('file', Buffer.from('# Hello\n'), 'hello.md')
    const uploadBody = expectRecord(upload.body as unknown)
    const fileId = getString(uploadBody, 'fileId')

    await app.request.post('/api/convert').send({ fileId })
    await waitForTerminalStatus(fileId)

    const conversionBefore = await db.query.conversions.findFirst({
      where: eq(schema.conversions.id, fileId),
    })
    if (!conversionBefore?.outputFilePath) {
      throw new Error('Expected outputFilePath to be set after a successful conversion.')
    }

    rmSync(conversionBefore.outputFilePath, { force: true })

    const download = await app.request.get(`/api/download/${fileId}`)
    const body = expectRecord(download.body as unknown)

    expect(download.status).toBe(404)
    expect(getString(body, 'error')).toBe('artifact_missing')
    expect(getString(body, 'status')).toBe('failed')

    const conversionAfter = await db.query.conversions.findFirst({
      where: eq(schema.conversions.id, fileId),
    })
    expect(conversionAfter?.status).toBe('failed')
  })

  it('enforces the per-minute API request cap', async () => {
    for (let index = 0; index < 10; index += 1) {
      const response = await app.request.get('/api/rate-limit-status')
      expect(response.status).toBe(200)
    }

    const limited = await app.request.get('/api/rate-limit-status')
    const limitedBody = expectRecord(limited.body as unknown)

    expect(limited.status).toBe(429)
    expect(getString(limitedBody, 'error')).toBe('request_rate_limited')
  })

  it('exposes a health endpoint', async () => {
    const response = await app.request.get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })
})
