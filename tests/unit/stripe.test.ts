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
  opts: ({
    fileId: string
    clientAttemptId?: never
  } | {
    clientAttemptId: string
    fileId?: never
  }) & {
    stripeSessionId: string
    status: string
    checkoutExpiresAt?: string | null
    stripePaymentIntent?: string | null
    conversionType?: string
  },
) {
  await db.insert(schema.payments).values({
    fileId: 'fileId' in opts ? opts.fileId : null,
    clientAttemptId: 'clientAttemptId' in opts ? opts.clientAttemptId : null,
    stripeSessionId: opts.stripeSessionId,
    amountCents: 49,
    currency: 'usd',
    conversionType: opts.conversionType ?? 'docx-to-markdown',
    ipAddress: '127.0.0.1',
    status: opts.status,
    checkoutExpiresAt: opts.checkoutExpiresAt ?? null,
    stripePaymentIntent: opts.stripePaymentIntent ?? null,
  })
}

async function insertClientAttempt(
  db: DbType,
  schema: SchemaType,
  opts: {
    id: string
    status: string
    tokenHash?: string
    recoveryToken?: string | null
    wasPaid?: number
    expiresAt?: string
  },
) {
  await db.insert(schema.clientConversionAttempts).values({
    id: opts.id,
    conversionType: 'png-to-jpg',
    category: 'image',
    ipAddress: '127.0.0.1',
    inputMode: 'file',
    tokenHash: opts.tokenHash ?? 'token-hash',
    recoveryToken: opts.recoveryToken ?? null,
    wasPaid: opts.wasPaid ?? 0,
    status: opts.status,
    expiresAt: opts.expiresAt ?? new Date(Date.now() + 30 * 60_000).toISOString(),
  })
}

function makeStripeSession(opts: {
  sessionId: string
  fileId?: string
  attemptId?: string
  paymentIntent?: string
  amountTotal?: number
  currency?: string
  paymentStatus?: Stripe.Checkout.Session.PaymentStatus
  status?: Stripe.Checkout.Session.Status
  expiresAt?: number | null
}): Stripe.Checkout.Session {
  const metadata: Record<string, string> = {}
  if (opts.fileId) {
    metadata.fileId = opts.fileId
  }
  if (opts.attemptId) {
    metadata.attemptId = opts.attemptId
  }

  const session = {
    id: opts.sessionId,
    metadata,
    payment_intent: opts.paymentIntent ?? 'pi_test_default',
    amount_total: opts.amountTotal ?? 49,
    currency: opts.currency ?? 'usd',
    payment_status: opts.paymentStatus ?? 'paid',
    status: opts.status ?? 'complete',
    expires_at: opts.expiresAt ?? null,
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
    process.env.WITTYFLIP_DISABLE_ENV_FILE_LOAD = '1'

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

  describe('createClientCheckoutSession', () => {
    it('throws when the client attempt is not found', async () => {
      const { createClientCheckoutSession } = await import('~/lib/stripe')
      await expect(createClientCheckoutSession('missing-attempt')).rejects.toThrow(
        'Client conversion attempt not found.',
      )
    })

    it.each(['reserved', 'ready', 'completed', 'failed'])(
      'throws for disallowed client conversion status "%s"',
      async (status) => {
        await insertClientAttempt(db, schema, { id: 'attempt-bad-status', status })
        const { createClientCheckoutSession } = await import('~/lib/stripe')
        await expect(createClientCheckoutSession('attempt-bad-status')).rejects.toThrow(
          `Cannot create checkout for client conversion with status "${status}".`,
        )
      },
    )

    it('throws when the client attempt has already expired', async () => {
      await insertClientAttempt(db, schema, {
        id: 'attempt-expired',
        status: 'payment_required',
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      })

      const { createClientCheckoutSession } = await import('~/lib/stripe')
      await expect(createClientCheckoutSession('attempt-expired')).rejects.toThrow(
        'Client conversion attempt has expired.',
      )
    })

    it('returns a reusable open pending session without creating a new client checkout', async () => {
      const attemptId = 'attempt-reuse'
      const futureExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString()

      await insertClientAttempt(db, schema, { id: attemptId, status: 'payment_required' })
      await insertPayment(db, schema, {
        clientAttemptId: attemptId,
        stripeSessionId: 'sess_client_existing',
        status: 'pending',
        checkoutExpiresAt: futureExpiry,
        conversionType: 'png-to-jpg',
      })

      mockStripeClient.checkout.sessions.retrieve.mockResolvedValue({
        status: 'open',
        url: 'https://checkout.stripe.com/client-existing',
        id: 'sess_client_existing',
      })

      const { createClientCheckoutSession } = await import('~/lib/stripe')
      const result = await createClientCheckoutSession(attemptId)

      expect(result).toEqual({
        checkoutUrl: 'https://checkout.stripe.com/client-existing',
        sessionId: 'sess_client_existing',
      })
      expect(mockStripeClient.checkout.sessions.create).not.toHaveBeenCalled()
    })

    it('creates a new client checkout session and writes a pending payment row', async () => {
      const attemptId = 'attempt-new'
      await insertClientAttempt(db, schema, { id: attemptId, status: 'payment_required' })

      mockStripeClient.checkout.sessions.create.mockResolvedValue({
        id: 'sess_client_new',
        url: 'https://checkout.stripe.com/client-new',
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      })

      const { createClientCheckoutSession } = await import('~/lib/stripe')
      const result = await createClientCheckoutSession(attemptId)

      expect(result).toEqual({
        checkoutUrl: 'https://checkout.stripe.com/client-new',
        sessionId: 'sess_client_new',
      })

      const payment = await db.query.payments.findFirst({
        where: eq(schema.payments.stripeSessionId, 'sess_client_new'),
      })
      expect(payment).toMatchObject({
        clientAttemptId: attemptId,
        status: 'pending',
        conversionType: 'png-to-jpg',
      })

      const attempt = await db.query.clientConversionAttempts.findFirst({
        where: eq(schema.clientConversionAttempts.id, attemptId),
      })
      expect(attempt?.status).toBe('pending_payment')
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
    it('throws when both fileId and attemptId are absent from session metadata', async () => {
      const { handleCheckoutCompleted } = await import('~/lib/stripe')
      const session = {
        id: 'sess_1',
        metadata: {},
        payment_intent: 'pi_1',
      } as unknown as Stripe.Checkout.Session
      await expect(handleCheckoutCompleted(session)).rejects.toThrow(
        'Missing fileId or attemptId in Stripe session metadata.',
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

    it('throws when no client conversion attempt exists for the attemptId', async () => {
      await insertPayment(db, schema, {
        clientAttemptId: 'attempt-noconv',
        stripeSessionId: 'sess_attempt_noconv',
        status: 'pending',
        conversionType: 'png-to-jpg',
      })

      const { handleCheckoutCompleted } = await import('~/lib/stripe')
      await expect(
        handleCheckoutCompleted(makeStripeSession({
          sessionId: 'sess_attempt_noconv',
          attemptId: 'attempt-noconv',
        })),
      ).rejects.toThrow('No client conversion attempt record found for attemptId.')
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

    it('marks client payments completed, rotates the token, and leaves the attempt ready without enqueuing', async () => {
      const attemptId = 'attempt-complete'
      await insertClientAttempt(db, schema, { id: attemptId, status: 'pending_payment' })
      await insertPayment(db, schema, {
        clientAttemptId: attemptId,
        stripeSessionId: 'sess_attempt_complete',
        status: 'pending',
        conversionType: 'png-to-jpg',
      })

      const { handleCheckoutCompleted } = await import('~/lib/stripe')
      const { hashClientAttemptToken } = await import('~/lib/client-conversion-attempts')

      await handleCheckoutCompleted(makeStripeSession({
        sessionId: 'sess_attempt_complete',
        attemptId,
        paymentIntent: 'pi_attempt_complete',
      }))

      const payment = await db.query.payments.findFirst({
        where: eq(schema.payments.stripeSessionId, 'sess_attempt_complete'),
      })
      expect(payment).toMatchObject({
        status: 'completed',
        stripePaymentIntent: 'pi_attempt_complete',
      })

      const attempt = await db.query.clientConversionAttempts.findFirst({
        where: eq(schema.clientConversionAttempts.id, attemptId),
      })
      expect(attempt?.status).toBe('ready')
      expect(attempt?.wasPaid).toBe(1)
      expect(attempt?.recoveryToken).toBeTruthy()
      expect(attempt?.tokenHash).toBe(hashClientAttemptToken(attempt!.recoveryToken!))
      // Expiry should be extended to a fresh 30-minute window after payment
      const expiresAt = new Date(attempt!.expiresAt).getTime()
      expect(expiresAt).toBeGreaterThan(Date.now() + 29 * 60_000)
      expect(mockEnqueueJob).not.toHaveBeenCalled()
    })

    it('rejects checkout completion when the Stripe session amount does not match the payment record', async () => {
      const fileId = 'conv-amount-mismatch'
      await insertConversion(db, schema, fileId, 'pending_payment')
      await insertPayment(db, schema, {
        fileId,
        stripeSessionId: 'sess_amount_mismatch',
        status: 'pending',
      })

      const { handleCheckoutCompleted } = await import('~/lib/stripe')

      await expect(handleCheckoutCompleted(
        makeStripeSession({
          sessionId: 'sess_amount_mismatch',
          fileId,
          amountTotal: 149,
        }),
      )).rejects.toThrow('Stripe session amount does not match payment record.')

      const payment = await db.query.payments.findFirst({
        where: eq(schema.payments.stripeSessionId, 'sess_amount_mismatch'),
      })
      expect(payment?.status).toBe('pending')
      expect(mockEnqueueJob).not.toHaveBeenCalled()
    })

    it('rejects checkout completion when the Stripe session currency does not match the payment record', async () => {
      const fileId = 'conv-currency-mismatch'
      await insertConversion(db, schema, fileId, 'pending_payment')
      await insertPayment(db, schema, {
        fileId,
        stripeSessionId: 'sess_currency_mismatch',
        status: 'pending',
      })

      const { handleCheckoutCompleted } = await import('~/lib/stripe')

      await expect(handleCheckoutCompleted(
        makeStripeSession({
          sessionId: 'sess_currency_mismatch',
          fileId,
          currency: 'eur',
        }),
      )).rejects.toThrow('Stripe session currency does not match payment record.')

      const payment = await db.query.payments.findFirst({
        where: eq(schema.payments.stripeSessionId, 'sess_currency_mismatch'),
      })
      expect(payment?.status).toBe('pending')
      expect(mockEnqueueJob).not.toHaveBeenCalled()
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

      it('recovers client attempts by minting a recovery token when payment is already completed but the attempt is still pending_payment', async () => {
        const attemptId = 'attempt-recovery'
        await insertClientAttempt(db, schema, { id: attemptId, status: 'pending_payment' })
        await insertPayment(db, schema, {
          clientAttemptId: attemptId,
          stripeSessionId: 'sess_attempt_recovery',
          status: 'completed',
          stripePaymentIntent: 'pi_attempt_recovery',
          conversionType: 'png-to-jpg',
        })

        const { handleCheckoutCompleted } = await import('~/lib/stripe')

        await handleCheckoutCompleted(makeStripeSession({
          sessionId: 'sess_attempt_recovery',
          attemptId,
        }))

        const attempt = await db.query.clientConversionAttempts.findFirst({
          where: eq(schema.clientConversionAttempts.id, attemptId),
        })
        expect(attempt?.status).toBe('ready')
        expect(attempt?.recoveryToken).toBeTruthy()
        // Expiry should be extended to a fresh 30-minute window after payment recovery
        const expiresAt = new Date(attempt!.expiresAt).getTime()
        expect(expiresAt).toBeGreaterThan(Date.now() + 29 * 60_000)
        expect(mockEnqueueJob).not.toHaveBeenCalled()
      })
    })
  })

  describe('reconcilePendingPayment', () => {
    it('completes and re-queues a paid checkout when polling finds a successful Stripe session before the webhook arrives', async () => {
      const fileId = 'conv-reconcile-paid'
      await insertConversion(db, schema, fileId, 'pending_payment')
      await insertPayment(db, schema, {
        fileId,
        stripeSessionId: 'sess_reconcile_paid',
        status: 'pending',
      })

      mockStripeClient.checkout.sessions.retrieve.mockResolvedValue(
        makeStripeSession({
          sessionId: 'sess_reconcile_paid',
          fileId,
          paymentIntent: 'pi_reconcile_paid',
        }),
      )

      const { reconcilePendingPayment } = await import('~/lib/stripe')
      await reconcilePendingPayment(fileId)

      const payment = await db.query.payments.findFirst({
        where: eq(schema.payments.stripeSessionId, 'sess_reconcile_paid'),
      })
      expect(payment?.status).toBe('completed')
      expect(payment?.stripePaymentIntent).toBe('pi_reconcile_paid')

      const conversion = await db.query.conversions.findFirst({
        where: eq(schema.conversions.id, fileId),
      })
      expect(conversion?.wasPaid).toBe(1)
      expect(mockEnqueueJob).toHaveBeenCalledOnce()
      expect(mockEnqueueJob).toHaveBeenCalledWith(fileId)
    })

    it('restores payment_required when the latest checkout session has expired', async () => {
      const fileId = 'conv-reconcile-expired'
      await insertConversion(db, schema, fileId, 'pending_payment')
      await insertPayment(db, schema, {
        fileId,
        stripeSessionId: 'sess_reconcile_expired',
        status: 'pending',
        checkoutExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      })

      const { reconcilePendingPayment } = await import('~/lib/stripe')
      await reconcilePendingPayment(fileId)

      const payment = await db.query.payments.findFirst({
        where: eq(schema.payments.stripeSessionId, 'sess_reconcile_expired'),
      })
      expect(payment?.status).toBe('expired')
      expect(mockStripeClient.checkout.sessions.retrieve).not.toHaveBeenCalled()

      const conversion = await db.query.conversions.findFirst({
        where: eq(schema.conversions.id, fileId),
      })
      expect(conversion?.status).toBe('payment_required')
      expect(conversion?.errorMessage).toBe('Your checkout session expired. Please try payment again.')
    })

    it('restores payment_required when Stripe reports that checkout completed without a paid status', async () => {
      const fileId = 'conv-reconcile-unpaid'
      await insertConversion(db, schema, fileId, 'pending_payment')
      await insertPayment(db, schema, {
        fileId,
        stripeSessionId: 'sess_reconcile_unpaid',
        status: 'pending',
      })

      mockStripeClient.checkout.sessions.retrieve.mockResolvedValue(
        makeStripeSession({
          sessionId: 'sess_reconcile_unpaid',
          fileId,
          paymentStatus: 'unpaid',
        }),
      )

      const { reconcilePendingPayment } = await import('~/lib/stripe')
      await reconcilePendingPayment(fileId)

      const payment = await db.query.payments.findFirst({
        where: eq(schema.payments.stripeSessionId, 'sess_reconcile_unpaid'),
      })
      expect(payment?.status).toBe('failed')

      const conversion = await db.query.conversions.findFirst({
        where: eq(schema.conversions.id, fileId),
      })
      expect(conversion?.status).toBe('payment_required')
      expect(conversion?.errorMessage).toBe('Payment was not completed. Please try again.')
    })
  })

  describe('reconcileClientPendingPayment', () => {
    it('moves a paid client checkout to ready and stores a one-time recovery token', async () => {
      const attemptId = 'attempt-reconcile-paid'
      await insertClientAttempt(db, schema, { id: attemptId, status: 'pending_payment' })
      await insertPayment(db, schema, {
        clientAttemptId: attemptId,
        stripeSessionId: 'sess_attempt_reconcile_paid',
        status: 'pending',
        conversionType: 'png-to-jpg',
      })

      mockStripeClient.checkout.sessions.retrieve.mockResolvedValue(
        makeStripeSession({
          sessionId: 'sess_attempt_reconcile_paid',
          attemptId,
          paymentIntent: 'pi_attempt_reconcile_paid',
        }),
      )

      const { reconcileClientPendingPayment } = await import('~/lib/stripe')
      await reconcileClientPendingPayment(attemptId)

      const payment = await db.query.payments.findFirst({
        where: eq(schema.payments.stripeSessionId, 'sess_attempt_reconcile_paid'),
      })
      expect(payment).toMatchObject({
        status: 'completed',
        stripePaymentIntent: 'pi_attempt_reconcile_paid',
      })

      const attempt = await db.query.clientConversionAttempts.findFirst({
        where: eq(schema.clientConversionAttempts.id, attemptId),
      })
      expect(attempt?.status).toBe('ready')
      expect(attempt?.wasPaid).toBe(1)
      expect(attempt?.recoveryToken).toBeTruthy()
      // Expiry should be extended to a fresh 30-minute window after payment reconciliation
      const expiresAt = new Date(attempt!.expiresAt).getTime()
      expect(expiresAt).toBeGreaterThan(Date.now() + 29 * 60_000)
      expect(mockEnqueueJob).not.toHaveBeenCalled()
    })

    it('restores payment_required when the client checkout session has expired', async () => {
      const attemptId = 'attempt-reconcile-expired'
      await insertClientAttempt(db, schema, { id: attemptId, status: 'pending_payment' })
      await insertPayment(db, schema, {
        clientAttemptId: attemptId,
        stripeSessionId: 'sess_attempt_reconcile_expired',
        status: 'pending',
        checkoutExpiresAt: new Date(Date.now() - 1_000).toISOString(),
        conversionType: 'png-to-jpg',
      })

      const { reconcileClientPendingPayment } = await import('~/lib/stripe')
      await reconcileClientPendingPayment(attemptId)

      const payment = await db.query.payments.findFirst({
        where: eq(schema.payments.stripeSessionId, 'sess_attempt_reconcile_expired'),
      })
      expect(payment?.status).toBe('expired')

      const attempt = await db.query.clientConversionAttempts.findFirst({
        where: eq(schema.clientConversionAttempts.id, attemptId),
      })
      expect(attempt?.status).toBe('payment_required')
      expect(attempt?.errorMessage).toBe('Your checkout session expired. Please try payment again.')
    })

    it('restores payment_required when Stripe reports a completed-but-unpaid client checkout', async () => {
      const attemptId = 'attempt-reconcile-unpaid'
      await insertClientAttempt(db, schema, { id: attemptId, status: 'pending_payment' })
      await insertPayment(db, schema, {
        clientAttemptId: attemptId,
        stripeSessionId: 'sess_attempt_reconcile_unpaid',
        status: 'pending',
        conversionType: 'png-to-jpg',
      })

      mockStripeClient.checkout.sessions.retrieve.mockResolvedValue(
        makeStripeSession({
          sessionId: 'sess_attempt_reconcile_unpaid',
          attemptId,
          paymentStatus: 'unpaid',
        }),
      )

      const { reconcileClientPendingPayment } = await import('~/lib/stripe')
      await reconcileClientPendingPayment(attemptId)

      const payment = await db.query.payments.findFirst({
        where: eq(schema.payments.stripeSessionId, 'sess_attempt_reconcile_unpaid'),
      })
      expect(payment?.status).toBe('failed')

      const attempt = await db.query.clientConversionAttempts.findFirst({
        where: eq(schema.clientConversionAttempts.id, attemptId),
      })
      expect(attempt?.status).toBe('payment_required')
      expect(attempt?.errorMessage).toBe('Payment was not completed. Please try again.')
    })
  })
})
