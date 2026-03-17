import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestApp } from '../helpers/create-test-app'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'

import type Stripe from 'stripe'
import type { TestApp } from '../helpers/create-test-app'
import type { TestSandbox } from '../helpers/test-env'
import type { ClientConversionType } from '~/lib/conversions'

const { mockStripeClient, mockGetClientConversionBySlug } = vi.hoisted(() => ({
  mockStripeClient: {
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
    webhooks: { constructEvent: vi.fn() },
  },
  mockGetClientConversionBySlug: vi.fn(),
}))

vi.mock('stripe', () => ({ default: vi.fn(() => mockStripeClient) }))

vi.mock('~/lib/conversions', async () => {
  const actual = await vi.importActual<typeof import('~/lib/conversions')>('~/lib/conversions')
  return {
    ...actual,
    getClientConversionBySlug: mockGetClientConversionBySlug,
  }
})

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

function makeClientStripeSession(attemptId: string, sessionId: string): Stripe.Checkout.Session {
  return {
    id: sessionId,
    metadata: { attemptId },
    payment_intent: 'pi_client_paid',
    amount_total: 49,
    currency: 'usd',
    payment_status: 'paid',
    status: 'complete',
  } as unknown as Stripe.Checkout.Session
}

function makeCheckoutCompletedEvent(attemptId: string, sessionId: string): Stripe.Event {
  return {
    id: 'evt_client_paid',
    type: 'checkout.session.completed',
    data: {
      object: makeClientStripeSession(attemptId, sessionId),
    },
  } as unknown as Stripe.Event
}

function getRecoveryCookie(response: { headers: Record<string, string | string[] | undefined> }): string {
  const setCookie = response.headers['set-cookie']
  const firstCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie
  if (!firstCookie) {
    throw new Error('Expected a recovery cookie header.')
  }

  return firstCookie.split(';')[0]
}

describe('client conversion API integration', () => {
  let sandbox: TestSandbox
  let app: TestApp
  let db: Awaited<ReturnType<typeof setupTestDb>>['db']
  let schema: Awaited<ReturnType<typeof setupTestDb>>['schema']

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    mockStripeClient.checkout.sessions.create.mockReset()
    mockStripeClient.checkout.sessions.retrieve.mockReset()
    mockStripeClient.webhooks.constructEvent.mockReset()

    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret'
    process.env.BASE_URL = 'http://localhost:3000'
    process.env.RECOVERY_COOKIE_SECRET = 'test-recovery-cookie-secret'

    sandbox = createTestSandbox()
    const setup = await setupTestDb(sandbox)
    db = setup.db
    schema = setup.schema

    mockGetClientConversionBySlug.mockImplementation((slug: string) =>
      slug === 'png-to-jpg' ? createMockClientConversion() : undefined)

    app = await createTestApp()

    const { initializeServerRuntime } = await import('~/lib/server-runtime')
    initializeServerRuntime()
  })

  afterEach(async () => {
    const { shutdownServerRuntime } = await import('~/lib/server-runtime')
    shutdownServerRuntime()
    await app.close()
  })

  it('handles start -> complete for a free client conversion', async () => {
    const start = await app.request
      .post('/api/client-conversion/start')
      .send({
        conversionSlug: 'png-to-jpg',
        originalFilename: 'input.png',
        fileSizeBytes: 128,
        inputMode: 'file',
      })
    const startBody = expectRecord(start.body as unknown)

    expect(start.status).toBe(200)
    expect(startBody).toMatchObject({
      allowed: true,
      processingMode: 'client',
      status: 'reserved',
    })
    expect(getNumber(startBody, 'remainingFreeAfterReservation')).toBe(1)
    const attemptId = getString(startBody, 'attemptId')
    const token = getString(startBody, 'token')
    expect(getRecoveryCookie(start)).toContain(`wf_attempt_${attemptId}=`)

    const complete = await app.request
      .post('/api/client-conversion/complete')
      .send({
        attemptId,
        token,
        outputFilename: 'output.jpg',
        outputMimeType: 'image/jpeg',
        outputSizeBytes: 512,
        durationMs: 21,
      })

    expect(complete.status).toBe(200)
    expect(complete.body).toEqual({ recorded: true })

    const status = await app.request
      .get('/api/client-conversion/status')
      .query({ attemptId })
    const statusBody = expectRecord(status.body as unknown)

    expect(status.status).toBe(200)
    expect(statusBody).toMatchObject({
      attemptId,
      status: 'completed',
      paid: false,
    })

    const attempt = await db.query.clientConversionAttempts.findFirst({
      where: eq(schema.clientConversionAttempts.id, attemptId),
    })
    const today = attempt?.rateLimitDate ?? new Date().toISOString().slice(0, 10)
    const rateLimit = await db.query.rateLimits.findFirst({
      where: and(
        eq(schema.rateLimits.ipAddress, '127.0.0.1'),
        eq(schema.rateLimits.date, today),
      ),
    })

    expect(attempt).toMatchObject({
      status: 'completed',
      outputFilename: 'output.jpg',
      outputMimeType: 'image/jpeg',
      outputSizeBytes: 512,
      durationMs: 21,
    })
    expect(rateLimit).toMatchObject({
      freeConversionCount: 1,
      reservedFreeSlots: 0,
    })
  })

  it('handles start -> fail for a free client conversion without burning quota', async () => {
    const start = await app.request
      .post('/api/client-conversion/start')
      .send({
        conversionSlug: 'png-to-jpg',
        inputMode: 'paste',
      })
    const startBody = expectRecord(start.body as unknown)
    const attemptId = getString(startBody, 'attemptId')
    const token = getString(startBody, 'token')

    const fail = await app.request
      .post('/api/client-conversion/fail')
      .send({
        attemptId,
        token,
        errorCode: 'conversion_failed',
        errorMessage: 'Canvas conversion failed.',
      })

    expect(fail.status).toBe(200)
    expect(fail.body).toEqual({ released: true })

    const attempt = await db.query.clientConversionAttempts.findFirst({
      where: eq(schema.clientConversionAttempts.id, attemptId),
    })
    const today = attempt?.rateLimitDate ?? new Date().toISOString().slice(0, 10)
    const rateLimit = await db.query.rateLimits.findFirst({
      where: and(
        eq(schema.rateLimits.ipAddress, '127.0.0.1'),
        eq(schema.rateLimits.date, today),
      ),
    })

    expect(attempt).toMatchObject({
      status: 'failed',
      errorCode: 'conversion_failed',
      errorMessage: 'Canvas conversion failed.',
    })
    expect(rateLimit).toMatchObject({
      freeConversionCount: 0,
      reservedFreeSlots: 0,
    })
  })

  it('handles the paid client conversion flow with one-time recovery token behavior and cookie fallback', async () => {
    const today = new Date().toISOString().slice(0, 10)
    await db.insert(schema.rateLimits).values({
      ipAddress: '127.0.0.1',
      date: today,
      freeConversionCount: 2,
      reservedFreeSlots: 0,
    })

    const start = await app.request
      .post('/api/client-conversion/start')
      .send({
        conversionSlug: 'png-to-jpg',
        inputMode: 'file',
      })
    const startBody = expectRecord(start.body as unknown)

    expect(start.status).toBe(200)
    expect(startBody).toMatchObject({
      allowed: false,
      requiresPayment: true,
      status: 'payment_required',
    })

    const attemptId = getString(startBody, 'attemptId')
    const recoveryCookie = getRecoveryCookie(start)

    mockStripeClient.checkout.sessions.create.mockResolvedValue({
      id: 'cs_test_client_paid',
      url: 'https://checkout.stripe.com/pay/cs_test_client_paid',
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    })

    const checkout = await app.request
      .post('/api/create-checkout')
      .send({ attemptId })
    const checkoutBody = expectRecord(checkout.body as unknown)

    expect(checkout.status).toBe(200)
    expect(checkoutBody).toMatchObject({
      attemptId,
      sessionId: 'cs_test_client_paid',
    })

    mockStripeClient.webhooks.constructEvent.mockReturnValue(
      makeCheckoutCompletedEvent(attemptId, 'cs_test_client_paid'),
    )

    const webhook = await app.request
      .post('/api/webhook/stripe')
      .set('stripe-signature', 'sig_client_paid')
      .set('content-type', 'application/json')
      .send('{"id":"evt_client_paid","type":"checkout.session.completed"}')

    expect(webhook.status).toBe(200)

    const wrongIpStatus = await app.request
      .get('/api/client-conversion/status')
      .set('x-test-peer-ip', '203.0.113.44')
      .query({ attemptId })
    const wrongIpStatusBody = expectRecord(wrongIpStatus.body as unknown)

    expect(wrongIpStatus.status).toBe(200)
    expect(wrongIpStatusBody).toMatchObject({
      attemptId,
      status: 'ready',
      paid: true,
    })
    expect('token' in wrongIpStatusBody).toBe(false)

    const fallbackStatus = await app.request
      .get('/api/client-conversion/status')
      .set('x-test-peer-ip', '203.0.113.44')
      .set('Cookie', recoveryCookie)
      .query({ attemptId })
    const fallbackStatusBody = expectRecord(fallbackStatus.body as unknown)

    expect(fallbackStatus.status).toBe(200)
    expect(fallbackStatusBody).toMatchObject({
      attemptId,
      status: 'ready',
      paid: true,
    })
    const recoveryToken = getString(fallbackStatusBody, 'token')

    const secondStatus = await app.request
      .get('/api/client-conversion/status')
      .set('x-test-peer-ip', '203.0.113.44')
      .set('Cookie', recoveryCookie)
      .query({ attemptId })
    const secondStatusBody = expectRecord(secondStatus.body as unknown)

    expect(secondStatus.status).toBe(200)
    expect(secondStatusBody).toMatchObject({
      attemptId,
      status: 'ready',
      paid: true,
    })
    expect('token' in secondStatusBody).toBe(false)

    const complete = await app.request
      .post('/api/client-conversion/complete')
      .set('x-test-peer-ip', '203.0.113.44')
      .send({
        attemptId,
        token: recoveryToken,
        outputFilename: 'output.jpg',
        outputMimeType: 'image/jpeg',
        outputSizeBytes: 256,
      })

    expect(complete.status).toBe(200)
    expect(complete.body).toEqual({ recorded: true })

    const attempt = await db.query.clientConversionAttempts.findFirst({
      where: eq(schema.clientConversionAttempts.id, attemptId),
    })
    const payment = await db.query.payments.findFirst({
      where: eq(schema.payments.clientAttemptId, attemptId),
    })
    const rateLimit = await db.query.rateLimits.findFirst({
      where: and(
        eq(schema.rateLimits.ipAddress, '127.0.0.1'),
        eq(schema.rateLimits.date, today),
      ),
    })

    expect(attempt).toMatchObject({
      status: 'completed',
      wasPaid: 1,
      recoveryToken: null,
    })
    expect(payment?.status).toBe('completed')
    expect(rateLimit).toMatchObject({
      freeConversionCount: 2,
      reservedFreeSlots: 0,
    })
  })

  it('rejects invalid completion tokens without changing the attempt state', async () => {
    const start = await app.request
      .post('/api/client-conversion/start')
      .send({
        conversionSlug: 'png-to-jpg',
        inputMode: 'file',
      })
    const startBody = expectRecord(start.body as unknown)
    const attemptId = getString(startBody, 'attemptId')

    const invalidComplete = await app.request
      .post('/api/client-conversion/complete')
      .send({
        attemptId,
        token: 'invalid-token',
        outputFilename: 'output.jpg',
        outputMimeType: 'image/jpeg',
      })
    const invalidCompleteBody = expectRecord(invalidComplete.body as unknown)

    expect(invalidComplete.status).toBe(403)
    expect(getString(invalidCompleteBody, 'error')).toBe('invalid_token')

    const attempt = await db.query.clientConversionAttempts.findFirst({
      where: eq(schema.clientConversionAttempts.id, attemptId),
    })
    expect(attempt?.status).toBe('reserved')
  })

  it('surfaces expired attempts through status and completion endpoints', async () => {
    const start = await app.request
      .post('/api/client-conversion/start')
      .send({
        conversionSlug: 'png-to-jpg',
        inputMode: 'file',
      })
    const startBody = expectRecord(start.body as unknown)
    const attemptId = getString(startBody, 'attemptId')
    const token = getString(startBody, 'token')

    await db
      .update(schema.clientConversionAttempts)
      .set({
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      })
      .where(eq(schema.clientConversionAttempts.id, attemptId))

    const status = await app.request
      .get('/api/client-conversion/status')
      .query({ attemptId })
    const statusBody = expectRecord(status.body as unknown)

    expect(status.status).toBe(200)
    expect(statusBody).toMatchObject({
      attemptId,
      status: 'expired',
      paid: false,
    })

    const complete = await app.request
      .post('/api/client-conversion/complete')
      .send({
        attemptId,
        token,
        outputFilename: 'output.jpg',
        outputMimeType: 'image/jpeg',
      })
    const completeBody = expectRecord(complete.body as unknown)

    expect(complete.status).toBe(410)
    expect(getString(completeBody, 'error')).toBe('attempt_expired')
  })
})
