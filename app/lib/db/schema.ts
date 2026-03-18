import { sqliteTable, text, integer, uniqueIndex, index, check } from 'drizzle-orm/sqlite-core'
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
  fileId: text('file_id'),
  clientAttemptId: text('client_attempt_id'),
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
}, (table) => [
  check(
    'payments_reference_check',
    sql`(
      (${table.fileId} is not null and ${table.clientAttemptId} is null) or
      (${table.fileId} is null and ${table.clientAttemptId} is not null)
    )`,
  ),
])

export const clientConversionAttempts = sqliteTable('client_conversion_attempts', {
  id: text('id').primaryKey(),
  conversionType: text('conversion_type').notNull(),
  category: text('category').notNull(),
  ipAddress: text('ip_address').notNull(),
  inputMode: text('input_mode').notNull(),
  originalFilename: text('original_filename'),
  inputSizeBytes: integer('input_size_bytes'),
  outputSizeBytes: integer('output_size_bytes'),
  outputFilename: text('output_filename'),
  outputMimeType: text('output_mime_type'),
  tokenHash: text('token_hash').notNull(),
  recoveryToken: text('recovery_token'),
  rateLimitDate: text('rate_limit_date'),
  wasPaid: integer('was_paid').default(0),
  status: text('status').notNull().default('reserved'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  durationMs: integer('duration_ms'),
  startedAt: text('started_at').default(sql`(datetime('now'))`),
  completedAt: text('completed_at'),
  expiresAt: text('expires_at').notNull(),
}, (table) => [
  index('client_attempts_status_expires_idx').on(table.status, table.expiresAt),
  index('client_attempts_ip_started_idx').on(table.ipAddress, table.startedAt),
])

export const conversions = sqliteTable('conversions', {
  id: text('id').primaryKey(), // UUID
  originalFilename: text('original_filename').notNull(),
  category: text('category').notNull().default('document'),
  sourceFormat: text('source_format').notNull(),
  targetFormat: text('target_format').notNull(),
  conversionType: text('conversion_type').notNull(),
  ipAddress: text('ip_address').notNull(),
  inputFilePath: text('input_file_path').notNull(),
  inputFileSizeBytes: integer('input_file_size_bytes'),
  outputFilePath: text('output_file_path'),
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

export const conversionEvents = sqliteTable('conversion_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fileId: text('file_id').notNull(),
  eventSource: text('event_source').notNull().default('server'),
  eventType: text('event_type').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  paymentStatus: text('payment_status'),
  toolName: text('tool_name'),
  message: text('message').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (table) => [
  index('conversion_events_file_created_idx').on(table.fileId, table.createdAt),
  index('conversion_events_event_created_idx').on(table.eventType, table.createdAt),
])
