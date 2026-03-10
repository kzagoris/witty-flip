import '~/lib/load-env'

export const isProduction = process.env.NODE_ENV === 'production'

export function validateEnv(): void {
  const required = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] as const

  for (const key of required) {
    if (!process.env[key]) {
      if (isProduction) {
        throw new Error(`Missing required environment variable: ${key}`)
      }
      console.warn(`[env] Warning: ${key} is not set`)
    }
  }

  if (!process.env.METRICS_API_KEY) {
    console.warn('[env] Warning: METRICS_API_KEY is not set — /api/metrics will return 503')
  }

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'file:./data/sqlite.db'
  }

  if (!process.env.BASE_URL) {
    process.env.BASE_URL = 'http://localhost:3000'
  }
}
