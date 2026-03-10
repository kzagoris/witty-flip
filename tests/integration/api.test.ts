import { rmSync, writeFileSync } from 'node:fs'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'
import { createTestApp } from '../helpers/create-test-app'

import type Stripe from 'stripe'
import type { TestApp } from '../helpers/create-test-app'
import type { TestSandbox } from '../helpers/test-env'
import type { ConvertResult, Converter } from '~/lib/converters'

const { mockStripeClient } = vi.hoisted(() => ({
  mockStripeClient: {
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
    webhooks: { constructEvent: vi.fn() },
  },
}))

vi.mock('stripe', () => ({ default: vi.fn(() => mockStripeClient) }))

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

function makeStripeSession(fileId: string, sessionId: string): Stripe.Checkout.Session {
  return {
    id: sessionId,
    metadata: { fileId },
    payment_intent: 'pi_test_paid',
    amount_total: 49,
    currency: 'usd',
    payment_status: 'paid',
    status: 'complete',
  } as unknown as Stripe.Checkout.Session
}

function makeCheckoutCompletedEvent(fileId: string, sessionId: string): Stripe.Event {
  return {
    id: 'evt_test_paid',
    type: 'checkout.session.completed',
    data: {
      object: makeStripeSession(fileId, sessionId),
    },
  } as unknown as Stripe.Event
}

describe('Phase 3 API integration', () => {
  let sandbox: TestSandbox
  let app: TestApp
  let db: Awaited<ReturnType<typeof setupTestDb>>['db']
  let schema: Awaited<ReturnType<typeof setupTestDb>>['schema']
  let registerConverter: (name: string, converter: Converter) => void

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    mockStripeClient.checkout.sessions.create.mockReset()
    mockStripeClient.checkout.sessions.retrieve.mockReset()
    mockStripeClient.webhooks.constructEvent.mockReset()
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
    const { shutdownServerRuntime } = await import('~/lib/server-runtime')
    shutdownServerRuntime()
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

  async function waitForCondition(predicate: () => Promise<boolean>, failureMessage: string) {
    const deadline = Date.now() + 4_000

    while (Date.now() < deadline) {
      if (await predicate()) {
        return
      }

      await new Promise<void>(resolve => setTimeout(resolve, 25))
    }

    throw new Error(failureMessage)
  }

  async function countStatusChangeEvents(fileId: string, toStatus: string) {
    const rows = await db
      .select()
      .from(schema.conversionEvents)
      .where(and(
        eq(schema.conversionEvents.fileId, fileId),
        eq(schema.conversionEvents.eventType, 'conversion_status_changed'),
        eq(schema.conversionEvents.toStatus, toStatus),
      ))

    return rows.length
  }

  async function countPaymentStatusEvents(fileId: string, paymentStatus: string) {
    const rows = await db
      .select()
      .from(schema.conversionEvents)
      .where(and(
        eq(schema.conversionEvents.fileId, fileId),
        eq(schema.conversionEvents.eventType, 'payment_status_changed'),
        eq(schema.conversionEvents.paymentStatus, paymentStatus),
      ))

    return rows.length
  }

  it('handles upload -> convert -> status -> download', async () => {
    const convertSpy = vi.fn((_inputPath: string, outputPath: string) => {
      writeFileSync(outputPath, 'PDF DATA')
      return Promise.resolve({
        success: true,
        outputPath,
        exitCode: 0,
        durationMs: 12,
      } satisfies ConvertResult)
    })

    registerConverter('pandoc', {
      convert: convertSpy,
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
    expect(convertSpy).toHaveBeenCalledOnce()
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

  it('handles paid conversion: upload -> 402 -> checkout -> webhook -> download', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const convertSpy = vi.fn((_inputPath: string, outputPath: string) => {
      writeFileSync(outputPath, 'PAID PDF DATA')
      return Promise.resolve({
        success: true,
        outputPath,
        exitCode: 0,
        durationMs: 18,
      } satisfies ConvertResult)
    })

    await db.insert(schema.rateLimits).values({
      ipAddress: '127.0.0.1',
      date: today,
      freeConversionCount: 2,
      reservedFreeSlots: 0,
    })
    registerConverter('pandoc', { convert: convertSpy })

    const upload = await app.request
      .post('/api/upload')
      .field('conversionType', 'markdown-to-pdf')
      .attach('file', Buffer.from('# Paid Hello\n'), 'paid.md')
    const uploadBody = expectRecord(upload.body as unknown)
    const fileId = getString(uploadBody, 'fileId')

    const convert = await app.request.post('/api/convert').send({ fileId })
    const convertBody = expectRecord(convert.body as unknown)

    expect(convert.status).toBe(402)
    expect(getString(convertBody, 'error')).toBe('payment_required')
    expect(getString(convertBody, 'status')).toBe('payment_required')

    const sessionId = 'cs_test_paid_flow'
    mockStripeClient.checkout.sessions.create.mockResolvedValue({
      id: sessionId,
      url: 'https://checkout.stripe.com/pay/cs_test_paid_flow',
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    })

    const checkout = await app.request.post('/api/create-checkout').send({ fileId })
    const checkoutBody = expectRecord(checkout.body as unknown)

    expect(checkout.status).toBe(200)
    expect(getString(checkoutBody, 'fileId')).toBe(fileId)
    expect(getString(checkoutBody, 'sessionId')).toBe(sessionId)
    expect(getString(checkoutBody, 'checkoutUrl')).toContain('checkout.stripe.com')

    mockStripeClient.webhooks.constructEvent.mockReturnValue(makeCheckoutCompletedEvent(fileId, sessionId))

    const webhook = await app.request
      .post('/api/webhook/stripe')
      .set('stripe-signature', 'sig_test_paid_flow')
      .set('content-type', 'application/json')
      .send('{"id":"evt_test_paid","type":"checkout.session.completed"}')

    expect(webhook.status).toBe(200)
    expect(mockStripeClient.checkout.sessions.retrieve).not.toHaveBeenCalled()

    const completed = await waitForTerminalStatus(fileId)
    const completedBody = expectRecord(completed.body as unknown)
    expect(getString(completedBody, 'status')).toBe('completed')

    const download = await app.request.get(`/api/download/${fileId}`)
    expect(download.status).toBe(200)
    expect((download.body as Buffer).toString('utf-8')).toBe('PAID PDF DATA')

    const conversion = await db.query.conversions.findFirst({
      where: eq(schema.conversions.id, fileId),
    })
    const payments = await db.select().from(schema.payments).where(eq(schema.payments.fileId, fileId))
    const rateLimit = await db.query.rateLimits.findFirst({
      where: and(eq(schema.rateLimits.ipAddress, '127.0.0.1'), eq(schema.rateLimits.date, today)),
    })

    expect(convertSpy).toHaveBeenCalledOnce()
    expect(conversion?.wasPaid).toBe(1)
    expect(conversion?.status).toBe('completed')
    expect(payments).toHaveLength(1)
    expect(payments[0]?.status).toBe('completed')
    expect(rateLimit?.freeConversionCount).toBe(2)
    expect(rateLimit?.reservedFreeSlots).toBe(0)
  })

  it('handles duplicate checkout.session.completed webhooks without re-enqueueing', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const convertSpy = vi.fn((_inputPath: string, outputPath: string) => {
      writeFileSync(outputPath, 'DUPLICATE WEBHOOK PDF DATA')
      return Promise.resolve({
        success: true,
        outputPath,
        exitCode: 0,
        durationMs: 21,
      } satisfies ConvertResult)
    })

    await db.insert(schema.rateLimits).values({
      ipAddress: '127.0.0.1',
      date: today,
      freeConversionCount: 2,
      reservedFreeSlots: 0,
    })
    registerConverter('pandoc', { convert: convertSpy })

    const upload = await app.request
      .post('/api/upload')
      .field('conversionType', 'markdown-to-pdf')
      .attach('file', Buffer.from('# Duplicate webhook\n'), 'duplicate.md')
    const uploadBody = expectRecord(upload.body as unknown)
    const fileId = getString(uploadBody, 'fileId')

    const convert = await app.request.post('/api/convert').send({ fileId })
    expect(convert.status).toBe(402)

    const sessionId = 'cs_test_duplicate_webhook'
    mockStripeClient.checkout.sessions.create.mockResolvedValue({
      id: sessionId,
      url: 'https://checkout.stripe.com/pay/cs_test_duplicate_webhook',
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    })

    const checkout = await app.request.post('/api/create-checkout').send({ fileId })
    expect(checkout.status).toBe(200)

    mockStripeClient.webhooks.constructEvent.mockReturnValue(makeCheckoutCompletedEvent(fileId, sessionId))

    const rawBody = '{"id":"evt_test_duplicate","type":"checkout.session.completed"}'
    const firstWebhook = await app.request
      .post('/api/webhook/stripe')
      .set('stripe-signature', 'sig_duplicate_webhook')
      .set('content-type', 'application/json')
      .send(rawBody)
    expect(firstWebhook.status).toBe(200)

    await waitForTerminalStatus(fileId)

    const duplicateWebhook = await app.request
      .post('/api/webhook/stripe')
      .set('stripe-signature', 'sig_duplicate_webhook')
      .set('content-type', 'application/json')
      .send(rawBody)
    expect(duplicateWebhook.status).toBe(200)

    const payments = await db.select().from(schema.payments).where(eq(schema.payments.fileId, fileId))
    const conversion = await db.query.conversions.findFirst({
      where: eq(schema.conversions.id, fileId),
    })

    expect(convertSpy).toHaveBeenCalledOnce()
    expect(payments).toHaveLength(1)
    expect(conversion?.status).toBe('completed')
    expect(await countPaymentStatusEvents(fileId, 'completed')).toBe(1)
  })

  it('returns current status without re-enqueueing when convert is retried after state changes', async () => {
    const successSpy = vi.fn((_inputPath: string, outputPath: string) => {
      writeFileSync(outputPath, 'RETRY PDF DATA')
      return Promise.resolve({
        success: true,
        outputPath,
        exitCode: 0,
        durationMs: 10,
      } satisfies ConvertResult)
    })
    registerConverter('pandoc', { convert: successSpy })

    const firstUpload = await app.request
      .post('/api/upload')
      .field('conversionType', 'markdown-to-pdf')
      .attach('file', Buffer.from('# Retry success\n'), 'retry-success.md')
    const firstUploadBody = expectRecord(firstUpload.body as unknown)
    const completedFileId = getString(firstUploadBody, 'fileId')

    const firstConvert = await app.request.post('/api/convert').send({ fileId: completedFileId })
    expect(firstConvert.status).toBe(200)
    await waitForTerminalStatus(completedFileId)

    const completedRetry = await app.request.post('/api/convert').send({ fileId: completedFileId })
    const completedRetryBody = expectRecord(completedRetry.body as unknown)

    expect(completedRetry.status).toBe(200)
    expect(getString(completedRetryBody, 'status')).toBe('completed')
    expect(successSpy).toHaveBeenCalledOnce()

    const today = new Date().toISOString().slice(0, 10)
    await db
      .update(schema.rateLimits)
      .set({
        freeConversionCount: 2,
        reservedFreeSlots: 0,
      })
      .where(and(eq(schema.rateLimits.ipAddress, '127.0.0.1'), eq(schema.rateLimits.date, today)))

    const secondUpload = await app.request
      .post('/api/upload')
      .field('conversionType', 'markdown-to-pdf')
      .attach('file', Buffer.from('# Retry payment required\n'), 'retry-payment.md')
    const secondUploadBody = expectRecord(secondUpload.body as unknown)
    const paymentRequiredFileId = getString(secondUploadBody, 'fileId')

    const paymentRequired = await app.request.post('/api/convert').send({ fileId: paymentRequiredFileId })
    const paymentRequiredBody = expectRecord(paymentRequired.body as unknown)
    expect(paymentRequired.status).toBe(402)
    expect(getString(paymentRequiredBody, 'error')).toBe('payment_required')
    expect(getString(paymentRequiredBody, 'status')).toBe('payment_required')

    const paymentRequiredRetry = await app.request.post('/api/convert').send({ fileId: paymentRequiredFileId })
    const paymentRequiredRetryBody = expectRecord(paymentRequiredRetry.body as unknown)

    expect(paymentRequiredRetry.status).toBe(402)
    expect(getString(paymentRequiredRetryBody, 'error')).toBe('payment_required')
    expect(getString(paymentRequiredRetryBody, 'status')).toBe('payment_required')
    expect(successSpy).toHaveBeenCalledOnce()
    expect(await countStatusChangeEvents(paymentRequiredFileId, 'payment_required')).toBe(1)
  })

  it('limits concurrent conversions to 5 when submitting 6 jobs through the API', async () => {
    const resolvers: Array<(result: ConvertResult) => void> = []
    const convertSpy = vi.fn((_inputPath: string, _outputPath: string, _signal: AbortSignal) =>
      new Promise<ConvertResult>(resolve => {
        resolvers.push(resolve)
      }))

    registerConverter('pandoc', { convert: convertSpy })

    const fileIds: string[] = []

    for (let index = 0; index < 6; index += 1) {
      const peerIp = `203.0.113.${10 + index}`
      const upload = await app.request
        .post('/api/upload')
        .set('x-test-peer-ip', peerIp)
        .field('conversionType', 'markdown-to-pdf')
        .attach('file', Buffer.from(`# Concurrent ${index}\n`), `concurrent-${index}.md`)
      const uploadBody = expectRecord(upload.body as unknown)
      const fileId = getString(uploadBody, 'fileId')
      fileIds.push(fileId)

      const convert = await app.request
        .post('/api/convert')
        .set('x-test-peer-ip', peerIp)
        .send({ fileId })
      const convertBody = expectRecord(convert.body as unknown)

      expect(convert.status).toBe(200)
      expect(getString(convertBody, 'status')).toBe('queued')
    }

    await waitForCondition(async () => {
      const rows = await db.select().from(schema.conversions)
      const convertingCount = rows.filter(row => row.status === 'converting').length
      const queuedCount = rows.filter(row => row.status === 'queued').length
      return convertSpy.mock.calls.length === 5 && convertingCount === 5 && queuedCount === 1
    }, 'Timed out waiting for the first 5 conversions to start')

    resolvers.shift()?.({
      success: false,
      outputPath: '',
      exitCode: 1,
      errorMessage: 'intentional concurrency release',
      durationMs: 1,
    })

    await waitForCondition(async () => {
      const rows = await db.select().from(schema.conversions)
      const convertingCount = rows.filter(row => row.status === 'converting').length
      const queuedCount = rows.filter(row => row.status === 'queued').length
      const failedCount = rows.filter(row => row.status === 'failed').length
      return convertSpy.mock.calls.length === 6 && convertingCount === 5 && queuedCount === 0 && failedCount === 1
    }, 'Timed out waiting for the queued conversion to start after a slot opened')

    for (const resolve of resolvers.splice(0)) {
      resolve({
        success: false,
        outputPath: '',
        exitCode: 1,
        errorMessage: 'intentional concurrency cleanup',
        durationMs: 1,
      })
    }

    await waitForCondition(async () => {
      const rows = await db.select().from(schema.conversions)
      return rows.length === fileIds.length && rows.every(row => row.status === 'failed')
    }, 'Timed out waiting for all concurrent conversions to reach terminal status')
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

  it('checks rate-limit status independently from convert request throttling', async () => {
    const upload = await app.request
      .post('/api/upload')
      .field('conversionType', 'markdown-to-pdf')
      .attach('file', Buffer.from('# Hello\n'), 'hello.md')
    const uploadBody = expectRecord(upload.body as unknown)
    const fileId = getString(uploadBody, 'fileId')

    for (let index = 0; index < 10; index += 1) {
      const response = await app.request.get('/api/rate-limit-status')
      expect(response.status).toBe(200)
    }

    const convert = await app.request
      .post('/api/convert')
      .send({ fileId })
    const convertBody = expectRecord(convert.body as unknown)

    expect(convert.status).toBe(200)
    expect(getString(convertBody, 'status')).toBe('queued')
  })

  it('exposes a health endpoint', async () => {
    const response = await app.request.get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })
})
