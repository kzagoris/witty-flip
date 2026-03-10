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
      file_id TEXT NOT NULL,
      stripe_session_id TEXT NOT NULL UNIQUE,
      stripe_payment_intent TEXT,
      amount_cents INTEGER NOT NULL,
      currency TEXT DEFAULT 'usd',
      ip_address TEXT NOT NULL,
      conversion_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      checkout_expires_at TEXT,
      completed_at TEXT
    )
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS conversions (
      id TEXT PRIMARY KEY,
      original_filename TEXT NOT NULL,
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

  return { db, schema }
}
