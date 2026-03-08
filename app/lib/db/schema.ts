import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const rateLimits = sqliteTable('rate_limits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ipAddress: text('ip_address').notNull(),
  freeConversionCount: integer('free_conversion_count').default(0),
  reservedFreeSlots: integer('reserved_free_slots').default(0),
  date: text('date').notNull(), // YYYY-MM-DD
}, (table) => [
  uniqueIndex('rate_limits_ip_date_unique').on(table.ipAddress, table.date),
])

export const payments = sqliteTable('payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fileId: text('file_id').notNull(),
  stripeSessionId: text('stripe_session_id').notNull().unique(),
  stripePaymentIntent: text('stripe_payment_intent'),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').default('usd'),
  ipAddress: text('ip_address').notNull(),
  conversionType: text('conversion_type').notNull(),
  status: text('status').default('pending'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  checkoutExpiresAt: text('checkout_expires_at'),
  completedAt: text('completed_at'),
})

export const conversions = sqliteTable('conversions', {
  id: text('id').primaryKey(), // UUID
  originalFilename: text('original_filename').notNull(),
  sourceFormat: text('source_format').notNull(),
  targetFormat: text('target_format').notNull(),
  conversionType: text('conversion_type').notNull(),
  ipAddress: text('ip_address').notNull(),
  inputFilePath: text('input_file_path').notNull(),
  inputFileSizeBytes: integer('input_file_size_bytes'),
  outputFileSizeBytes: integer('output_file_size_bytes'),
  rateLimitDate: text('rate_limit_date'),
  toolName: text('tool_name'),
  toolExitCode: integer('tool_exit_code'),
  conversionTimeMs: integer('conversion_time_ms'),
  wasPaid: integer('was_paid').default(0),
  status: text('status').default('uploaded'),
  errorMessage: text('error_message'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  conversionStartedAt: text('conversion_started_at'),
  conversionCompletedAt: text('conversion_completed_at'),
  expiresAt: text('expires_at'),
})
