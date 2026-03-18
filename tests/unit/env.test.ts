import { describe, expect, it, vi, beforeEach } from 'vitest'

describe('validateEnv', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.WITTYFLIP_DISABLE_ENV_FILE_LOAD = '1'
  })

  it('hydrates METRICS_API_KEY from the repo .env file when not already present', async () => {
    delete process.env.METRICS_API_KEY
    delete process.env.WITTYFLIP_DISABLE_ENV_FILE_LOAD
    delete process.env.NODE_ENV
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_xxx'

    const { _resetLoadedEnvFilesForTests, loadEnvFiles } = await import('~/lib/load-env')
    _resetLoadedEnvFilesForTests()
    loadEnvFiles({ force: true })

    const { validateEnv } = await import('~/lib/env')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    validateEnv()

    expect(process.env.METRICS_API_KEY).toBe('uw7gug7no+jKXuWE06xQxjsnx4Hwl2qRkLmQSwLELt8=')
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('METRICS_API_KEY'))
  })

  it('sets default DATABASE_URL when not provided', async () => {
    delete process.env.DATABASE_URL
    delete process.env.NODE_ENV
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_xxx'
    process.env.METRICS_API_KEY = 'test-key'

    const { validateEnv } = await import('~/lib/env')
    validateEnv()

    expect(process.env.DATABASE_URL).toBe('file:./data/sqlite.db')
  })

  it('sets default BASE_URL when not provided', async () => {
    delete process.env.BASE_URL
    delete process.env.NODE_ENV
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_xxx'
    process.env.METRICS_API_KEY = 'test-key'

    const { validateEnv } = await import('~/lib/env')
    validateEnv()

    expect(process.env.BASE_URL).toBe('http://localhost:3000')
  })

  it('does not throw in dev when Stripe keys missing', async () => {
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_WEBHOOK_SECRET
    delete process.env.NODE_ENV
    process.env.METRICS_API_KEY = 'test-key'

    const { validateEnv } = await import('~/lib/env')
    expect(() => validateEnv()).not.toThrow()
  })

  it('throws in production when STRIPE_SECRET_KEY missing', async () => {
    delete process.env.STRIPE_SECRET_KEY
    process.env.NODE_ENV = 'production'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_xxx'
    process.env.METRICS_API_KEY = 'test-key'

    const { validateEnv } = await import('~/lib/env')
    expect(() => validateEnv()).toThrow(/STRIPE_SECRET_KEY/)
  })

  it('warns when METRICS_API_KEY is not set', async () => {
    delete process.env.METRICS_API_KEY
    delete process.env.NODE_ENV
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_xxx'

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { validateEnv } = await import('~/lib/env')
    validateEnv()

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('METRICS_API_KEY'),
    )
  })

  it('throws in production when RECOVERY_COOKIE_SECRET is missing', async () => {
    delete process.env.RECOVERY_COOKIE_SECRET
    process.env.NODE_ENV = 'production'
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_xxx'
    process.env.METRICS_API_KEY = 'test-key'

    const { validateEnv } = await import('~/lib/env')
    expect(() => validateEnv()).toThrow(/RECOVERY_COOKIE_SECRET/)
  })

  it('warns in dev when RECOVERY_COOKIE_SECRET is not set', async () => {
    delete process.env.RECOVERY_COOKIE_SECRET
    delete process.env.NODE_ENV
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_xxx'
    process.env.METRICS_API_KEY = 'test-key'

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { validateEnv } = await import('~/lib/env')
    validateEnv()

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('RECOVERY_COOKIE_SECRET'),
    )
  })
})
