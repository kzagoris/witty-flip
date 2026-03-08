import { describe, it, expect, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type Stripe from 'stripe'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'
import type { TestSandbox } from '../helpers/test-env'

// ---------------------------------------------------------------------------
// Hoisted mock objects — must be created before vi.mock factory calls run
// ---------------------------------------------------------------------------
const { mockStripeClient, mockEnqueueJob } = vi.hoisted(() => {
  const mockStripeClient = {
    checkout: {
      sessions: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  }
  const mockEnqueueJob = vi.fn()
  return { mockStripeClient, mockEnqueueJob }
})

vi.mock('stripe', () => ({ default: vi.fn(() => mockStripeClient) }))
vi.mock('~/lib/queue', () => ({ enqueueJob: mockEnqueueJob }))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DbType = Awaited<ReturnType<typeof setupTestDb>>['db']
type SchemaType = Awaited<ReturnType<typeof setupTestDb>>['schema']

async function insertConversion(
  db: DbType,
  schema: SchemaType,
  id: string,
  status: string,
) {
  await db.insert(schema.conversions).values({
    id,
    originalFilename: 'test.docx',
    sourceFormat: 'docx',
    targetFormat: 'md',
    conversionType: 'docx-to-markdown',
    ipAddress: '127.0.0.1',
    inputFilePath: `/tmp/${id}.docx`,
    status,
  })
}

async function insertPayment(
  db: DbType,
  schema: SchemaType,
  opts: {
    fileId: string
    stripeSessionId: string
    status: string
    checkoutExpiresAt?: string | null
    stripePaymentIntent?: string | null
  },
) {
  await db.insert(schema.payments).values({
    fileId: opts.fileId,
    stripeSessionId: opts.stripeSessionId,
    amountCents: 49,
    currency: 'usd',
    conversionType: 'docx-to-markdown',
    ipAddress: '127.0.0.1',
    status: opts.status,
    checkoutExpiresAt: opts.checkoutExpiresAt ?? null,
    stripePaymentIntent: opts.stripePaymentIntent ?? null,
  })
}

function makeStripeSession(opts: {
  sessionId: string
  fileId: string
  paymentIntent?: string
}): Stripe.Checkout.Session {
  const session = {
    id: opts.sessionId,
    metadata: { fileId: opts.fileId },
    payment_intent: opts.paymentIntent ?? 'pi_test_default',
  }

  return session as unknown as Stripe.Checkout.Session
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('stripe', () => {
  let sandbox: TestSandbox
  let db: DbType
  let schema: SchemaType

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    sandbox = createTestSandbox()

    // Default env config — individual tests can override before re-importing
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret'
    process.env.BASE_URL = 'http://localhost:3000'

    const result = await setupTestDb(sandbox)
    db = result.db
    schema = result.schema
  })

  // -------------------------------------------------------------------------
  // createCheckoutSession
  // -------------------------------------------------------------------------

  describe('createCheckoutSession', () => {
    it('throws when conversion is not found', async () => {
      const { createCheckoutSession } = await import('~/lib/stripe')
      await expect(createCheckoutSession('nonexistent-id')).rejects.toThrow(
        'Conversion not found.',
      )
    })

    it.each(['uploaded', 'queued', 'converting', 'completed', 'failed'])(
      'throws for disallowed status "%s"',
      async (status) => {
        await insertConversion(db, schema, 'conv-bad-status', status)
        const { createCheckoutSession } = await import('~/lib/stripe')
        await expect(createCheckoutSession('conv-bad-status')).rejects.toThrow(
          `Cannot create checkout for conversion with status "${status}".`,
        )
      },
    )

    it('throws when stripe is not configured (missing STRIPE_SECRET_KEY)', async () => {
      const fileId = 'conv-nostripe'
      await insertConversion(db, schema, fileId, 'payment_required')

      delete process.env.STRIPE_SECRET_KEY
      vi.resetModules()

      const { createCheckoutSession } = await import('~/lib/stripe')
      await expect(createCheckoutSession(fileId)).rejects.toThrow(
        'Payment system is not configured.',
      )
    })

    it('returns a reusable open pending session without creating a new checkout', async () => {
      const fileId = 'conv-reuse'
      const futureExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString()

      await insertConversion(db, schema, fileId, 'payment_required')
      await insertPayment(db, schema, {
        fileId,
        stripeSessionId: 'sess_existing',
        status: 'pending',
        checkoutExpiresAt: futureExpiry,
      })

      mockStripeClient.checkout.sessions.retrieve.mockResolvedValue({
        status: 'open',
        url: 'https://checkout.stripe.com/existing',
        id: 'sess_existing',
      })

      const { createCheckoutSession } = await import('~/lib/stripe')
      const result = await createCheckoutSession(fileId)

      expect(result.checkoutUrl).toBe('https://checkout.stripe.com/existing')
      expect(result.sessionId).toBe('sess_existing')
      expect(mockStripeClient.checkout.sessions.create).not.toHaveBeenCalled()
    })

    it('creates a new checkout session and writes a pending payment row, flipping status to pending_payment', async () => {
      const fileId = 'conv-new'
      await insertConversion(db, schema, fileId, 'payment_required')

      const expiresAtUnix = Math.floor(Date.now() / 1000) + 30 * 60
      mockStripeClient.checkout.sessions.create.mockResolvedValue({
        id: 'sess_new',
        url: 'https://checkout.stripe.com/new',
        expires_at: expiresAtUnix,
      })

      const { createCheckoutSession } = await import('~/lib/stripe')
      const result = await createCheckoutSession(fileId)

      expect(result.checkoutUrl).toBe('https://checkout.stripe.com/new')
      expect(result.sessionId).toBe('sess_new')
      expect(mockStripeClient.checkout.sessions.create).toHaveBeenCalledOnce()

      const payment = await db.query.payments.findFirst({
        where: eq(schema.payments.stripeSessionId, 'sess_new'),
      })
      expect(payment).toBeDefined()
      expect(payment!.status).toBe('pending')
      expect(payment!.fileId).toBe(fileId)
      expect(payment!.amountCents).toBe(49)

      const conversion = await db.query.conversions.findFirst({
        where: eq(schema.conversions.id, fileId),
      })
      expect(conversion!.status).toBe('pending_payment')
    })

    it('also accepts pending_payment status and creates a new session when none is reusable', async () => {
      const fileId = 'conv-pp'
      await insertConversion(db, schema, fileId, 'pending_payment')

      mockStripeClient.checkout.sessions.create.mockResolvedValue({
        id: 'sess_pp',
        url: 'https://checkout.stripe.com/pp',
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      })

      const { createCheckoutSession } = await import('~/lib/stripe')
      const result = await createCheckoutSession(fileId)

      expect(result.sessionId).toBe('sess_pp')
      expect(mockStripeClient.checkout.sessions.create).toHaveBeenCalledOnce()
    })
  })

  // -------------------------------------------------------------------------
  // verifyWebhookSignature
  // -------------------------------------------------------------------------

  describe('verifyWebhookSignature', () => {
    it('throws when stripe is not configured (missing STRIPE_SECRET_KEY)', async () => {
      delete process.env.STRIPE_SECRET_KEY
      vi.resetModules()

      const { verifyWebhookSignature } = await import('~/lib/stripe')
      expect(() => verifyWebhookSignature('body', 'sig')).toThrow(
        'Payment system is not configured.',
      )
    })

    it('throws when STRIPE_WEBHOOK_SECRET is not set', async () => {
      delete process.env.STRIPE_WEBHOOK_SECRET
      vi.resetModules()

      const { verifyWebhookSignature } = await import('~/lib/stripe')
      expect(() => verifyWebhookSignature('body', 'sig')).toThrow(
        'STRIPE_WEBHOOK_SECRET is not set.',
      )
    })

    it('delegates to stripe.webhooks.constructEvent and returns the event', async () => {
      const mockEvent = { type: 'checkout.session.completed', id: 'evt_1' }
      mockStripeClient.webhooks.constructEvent.mockReturnValue(mockEvent)

      const { verifyWebhookSignature } = await import('~/lib/stripe')
      const result = verifyWebhookSignature('raw-body', 'test-sig')

      expect(mockStripeClient.webhooks.constructEvent).toHaveBeenCalledWith(
        'raw-body',
        'test-sig',
        'whsec_test_secret',
      )
      expect(result).toEqual(mockEvent)
    })
  })

  // -------------------------------------------------------------------------
  // handleCheckoutCompleted
  // -------------------------------------------------------------------------

  describe('handleCheckoutCompleted', () => {
    it('throws when fileId is absent from session metadata', async () => {
      const { handleCheckoutCompleted } = await import('~/lib/stripe')
      const session = {
        id: 'sess_1',
        metadata: {},
        payment_intent: 'pi_1',
      } as unknown as Stripe.Checkout.Session
      await expect(handleCheckoutCompleted(session)).rejects.toThrow(
        'Missing fileId in Stripe session metadata.',
      )
    })

    it('throws when no payment record exists for the session', async () => {
      const fileId = 'conv-nopay'
      await insertConversion(db, schema, fileId, 'pending_payment')

      const { handleCheckoutCompleted } = await import('~/lib/stripe')
      await expect(
        handleCheckoutCompleted(makeStripeSession({ sessionId: 'sess_missing', fileId })),
      ).rejects.toThrow('No payment record found for Stripe session.')
    })

    it('throws when no conversion record exists for the fileId', async () => {
      await insertPayment(db, schema, {
        fileId: 'conv-noconv',
        stripeSessionId: 'sess_noconv',
        status: 'pending',
      })

      const { handleCheckoutCompleted } = await import('~/lib/stripe')
      await expect(
        handleCheckoutCompleted(makeStripeSession({ sessionId: 'sess_noconv', fileId: 'conv-noconv' })),
      ).rejects.toThrow('No conversion record found for fileId.')
    })

    it('marks payment completed, stores payment intent, sets wasPaid=1, and enqueues the job', async () => {
      const fileId = 'conv-complete'
      await insertConversion(db, schema, fileId, 'pending_payment')
      await insertPayment(db, schema, {
        fileId,
        stripeSessionId: 'sess_complete',
        status: 'pending',
      })

      const { handleCheckoutCompleted } = await import('~/lib/stripe')
      await handleCheckoutCompleted(
        makeStripeSession({ sessionId: 'sess_complete', fileId, paymentIntent: 'pi_completed' }),
      )

      const payment = await db.query.payments.findFirst({
        where: eq(schema.payments.stripeSessionId, 'sess_complete'),
      })
      expect(payment!.status).toBe('completed')
      expect(payment!.stripePaymentIntent).toBe('pi_completed')
      expect(payment!.completedAt).toBeTruthy()

      const conversion = await db.query.conversions.findFirst({
        where: eq(schema.conversions.id, fileId),
      })
      expect(conversion!.wasPaid).toBe(1)

      expect(mockEnqueueJob).toHaveBeenCalledOnce()
      expect(mockEnqueueJob).toHaveBeenCalledWith(fileId)
    })

    it('does not enqueue when conversion is already past pending_payment', async () => {
      const fileId = 'conv-queued'
      await insertConversion(db, schema, fileId, 'queued')
      await insertPayment(db, schema, {
        fileId,
        stripeSessionId: 'sess_queued',
        status: 'pending',
      })

      const { handleCheckoutCompleted } = await import('~/lib/stripe')
      await handleCheckoutCompleted(makeStripeSession({ sessionId: 'sess_queued', fileId }))

      expect(mockEnqueueJob).not.toHaveBeenCalled()
    })

    describe('idempotency (duplicate webhook)', () => {
      it('does not re-enqueue when payment is already completed and conversion is past pending_payment', async () => {
        const fileId = 'conv-idem-done'
        await insertConversion(db, schema, fileId, 'completed')
        await insertPayment(db, schema, {
          fileId,
          stripeSessionId: 'sess_idem',
          status: 'completed',
          stripePaymentIntent: 'pi_idem',
        })

        const { handleCheckoutCompleted } = await import('~/lib/stripe')
        await handleCheckoutCompleted(makeStripeSession({ sessionId: 'sess_idem', fileId }))

        expect(mockEnqueueJob).not.toHaveBeenCalled()
      })

      it('re-enqueues for recovery when payment is already completed but conversion is still pending_payment', async () => {
        const fileId = 'conv-recovery'
        await insertConversion(db, schema, fileId, 'pending_payment')
        await insertPayment(db, schema, {
          fileId,
          stripeSessionId: 'sess_recovery',
          status: 'completed',
          stripePaymentIntent: 'pi_recovery',
        })

        const { handleCheckoutCompleted } = await import('~/lib/stripe')
        await handleCheckoutCompleted(makeStripeSession({ sessionId: 'sess_recovery', fileId }))

        expect(mockEnqueueJob).toHaveBeenCalledOnce()
        expect(mockEnqueueJob).toHaveBeenCalledWith(fileId)
      })
    })
  })
})
