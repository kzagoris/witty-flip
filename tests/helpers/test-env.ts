import { mkdtempSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { registerTempRoot } from '../setup'

export interface TestSandbox {
  /** Root temp directory for this test */
  root: string
  /** data/conversions dir inside the sandbox */
  conversionsDir: string
  /** Path to the temp SQLite database file */
  dbUrl: string
}

/**
 * Build a per-test temp sandbox:
 *  - creates a temp dir with data/conversions inside
 *  - chdirs into it so queue.ts resolves CONVERSIONS_DIR correctly
 *  - sets DATABASE_URL to a temp SQLite file
 *
 * Call this before importing any DB-bound modules (use vi.isolateModules / dynamic import).
 */
export function createTestSandbox(): TestSandbox {
  const root = mkdtempSync(join(tmpdir(), 'wittyflip-test-'))
  registerTempRoot(root)

  const conversionsDir = join(root, 'data', 'conversions')
  mkdirSync(conversionsDir, { recursive: true })

  const dbUrl = `file:${join(root, 'test.db')}`
  process.env['DATABASE_URL'] = dbUrl

  process.chdir(root)

  return { root, conversionsDir, dbUrl }
}

/**
 * Import the DB module fresh (after sandbox is set up) and create all tables
 * so tests start with a clean, fully-migrated schema.
 *
 * Returns the drizzle `db` instance and raw schema exports.
 */
export async function setupTestDb(_sandbox: TestSandbox) {
  void _sandbox
  // Dynamic import ensures module-level singletons pick up the new DATABASE_URL
  const { db } = await import('~/lib/db/index')
  const schema = await import('~/lib/db/schema')

  // Create tables via raw SQL (mirrors drizzle schema; keeps tests independent of migration files)
  const client = (db as unknown as { $client: { execute: (sql: string) => Promise<void> } }).$client

  await client.execute(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_address TEXT NOT NULL,
      free_conversion_count INTEGER DEFAULT 0,
      reserved_free_slots INTEGER DEFAULT 0,
      date TEXT NOT NULL,
      UNIQUE(ip_address, date)
    )
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id TEXT,
      client_attempt_id TEXT,
      stripe_session_id TEXT NOT NULL UNIQUE,
      stripe_payment_intent TEXT,
      amount_cents INTEGER NOT NULL,
      currency TEXT DEFAULT 'usd',
      ip_address TEXT NOT NULL,
      conversion_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      checkout_expires_at TEXT,
      completed_at TEXT,
      CHECK (
        (file_id IS NOT NULL AND client_attempt_id IS NULL) OR
        (file_id IS NULL AND client_attempt_id IS NOT NULL)
      )
    )
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS conversions (
      id TEXT PRIMARY KEY,
      original_filename TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'document',
      source_format TEXT NOT NULL,
      target_format TEXT NOT NULL,
      conversion_type TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      input_file_path TEXT NOT NULL,
      input_file_size_bytes INTEGER,
      output_file_path TEXT,
      output_file_size_bytes INTEGER,
      rate_limit_date TEXT,
      tool_name TEXT,
      tool_exit_code INTEGER,
      conversion_time_ms INTEGER,
      was_paid INTEGER DEFAULT 0,
      status TEXT DEFAULT 'uploaded',
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      conversion_started_at TEXT,
      conversion_completed_at TEXT,
      expires_at TEXT
    )
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS conversion_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id TEXT NOT NULL,
      event_source TEXT NOT NULL DEFAULT 'server',
      event_type TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      payment_status TEXT,
      tool_name TEXT,
      message TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  await client.execute(`
    CREATE INDEX IF NOT EXISTS conversion_events_file_created_idx
    ON conversion_events(file_id, created_at)
  `)

  await client.execute(`
    CREATE INDEX IF NOT EXISTS conversion_events_event_created_idx
    ON conversion_events(event_type, created_at)
  `)

  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS conversions_after_insert_event
    AFTER INSERT ON conversions
    BEGIN
      INSERT INTO conversion_events (
        file_id,
        event_source,
        event_type,
        to_status,
        tool_name,
        message
      ) VALUES (
        NEW.id,
        'server',
        'conversion_created',
        NEW.status,
        NEW.tool_name,
        'Conversion created.'
      );
    END
  `)

  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS conversions_after_update_status_event
    AFTER UPDATE OF status ON conversions
    WHEN OLD.status IS NOT NEW.status
    BEGIN
      INSERT INTO conversion_events (
        file_id,
        event_source,
        event_type,
        from_status,
        to_status,
        tool_name,
        message
      ) VALUES (
        NEW.id,
        'server',
        'conversion_status_changed',
        OLD.status,
        NEW.status,
        NEW.tool_name,
        CASE
          WHEN NEW.error_message IS NOT NULL AND length(NEW.error_message) > 0 THEN NEW.error_message
          ELSE 'Conversion status changed.'
        END
      );
    END
  `)

  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS payments_after_insert_event
    AFTER INSERT ON payments
    BEGIN
      INSERT INTO conversion_events (
        file_id,
        event_source,
        event_type,
        payment_status,
        message
      ) VALUES (
        COALESCE(NEW.file_id, NEW.client_attempt_id),
        'server',
        'payment_created',
        NEW.status,
        'Payment record created.'
      );
    END
  `)

  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS payments_after_update_status_event
    AFTER UPDATE OF status ON payments
    WHEN OLD.status IS NOT NEW.status
    BEGIN
      INSERT INTO conversion_events (
        file_id,
        event_source,
        event_type,
        payment_status,
        message
      ) VALUES (
        COALESCE(NEW.file_id, NEW.client_attempt_id),
        'server',
        'payment_status_changed',
        NEW.status,
        'Payment status changed.'
      );
    END
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS client_conversion_attempts (
      id TEXT PRIMARY KEY,
      conversion_type TEXT NOT NULL,
      category TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      input_mode TEXT NOT NULL,
      original_filename TEXT,
      input_size_bytes INTEGER,
      output_size_bytes INTEGER,
      output_filename TEXT,
      output_mime_type TEXT,
      token_hash TEXT NOT NULL,
      recovery_token TEXT,
      rate_limit_date TEXT,
      was_paid INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'reserved',
      error_code TEXT,
      error_message TEXT,
      duration_ms INTEGER,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      expires_at TEXT NOT NULL
    )
  `)

  await client.execute(`
    CREATE INDEX IF NOT EXISTS client_attempts_status_expires_idx
    ON client_conversion_attempts(status, expires_at)
  `)

  await client.execute(`
    CREATE INDEX IF NOT EXISTS client_attempts_ip_started_idx
    ON client_conversion_attempts(ip_address, started_at)
  `)

  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS client_attempts_after_insert_event
    AFTER INSERT ON client_conversion_attempts
    BEGIN
      INSERT INTO conversion_events (
        file_id,
        event_source,
        event_type,
        to_status,
        message
      ) VALUES (
        NEW.id,
        'client',
        'conversion_created',
        NEW.status,
        'Client conversion attempt created.'
      );
    END
  `)

  await client.execute(`
    CREATE TRIGGER IF NOT EXISTS client_attempts_after_update_status_event
    AFTER UPDATE OF status ON client_conversion_attempts
    WHEN OLD.status IS NOT NEW.status
    BEGIN
      INSERT INTO conversion_events (
        file_id,
        event_source,
        event_type,
        from_status,
        to_status,
        message
      ) VALUES (
        NEW.id,
        'client',
        'conversion_status_changed',
        OLD.status,
        NEW.status,
        CASE
          WHEN NEW.error_message IS NOT NULL AND length(NEW.error_message) > 0 THEN NEW.error_message
          ELSE 'Client conversion status changed.'
        END
      );
    END
  `)

  return { db, schema }
}
