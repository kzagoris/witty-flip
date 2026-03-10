import { relative, resolve } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSandbox, setupTestDb } from '../helpers/test-env'
import { createTestApp } from '../helpers/create-test-app'

import type { TestApp } from '../helpers/create-test-app'
import type { TestSandbox } from '../helpers/test-env'

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

describe('API security integration', () => {
  let sandbox: TestSandbox
  let app: TestApp
  let db: Awaited<ReturnType<typeof setupTestDb>>['db']
  let schema: Awaited<ReturnType<typeof setupTestDb>>['schema']

  beforeEach(async () => {
    vi.resetModules()
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
  })

  afterEach(async () => {
    const { shutdownServerRuntime } = await import('~/lib/server-runtime')
    shutdownServerRuntime()
    await app.close()
  })

  it('uses UUID-based storage regardless of path traversal in uploaded filenames', async () => {
    const cases = [
      { uploaded: '../../etc/passwd.md', expectedOriginalFilename: 'passwd.md' },
      { uploaded: '..\\..\\windows\\system32\\config.md', expectedOriginalFilename: 'config.md' },
    ]

    for (const { uploaded, expectedOriginalFilename } of cases) {
      const upload = await app.request
        .post('/api/upload')
        .field('conversionType', 'markdown-to-pdf')
        .attach('file', Buffer.from('# Traversal test\n'), uploaded)
      const uploadBody = expectRecord(upload.body as unknown)

      expect(upload.status).toBe(200)
      const fileId = getString(uploadBody, 'fileId')

      const conversion = await db.query.conversions.findFirst({
        where: eq(schema.conversions.id, fileId),
      })

      expect(conversion?.inputFilePath).toMatch(/^[0-9a-f-]+\.md$/i)
      expect(conversion?.inputFilePath).not.toContain('..')
      expect(conversion?.inputFilePath).not.toContain('/')
      expect(conversion?.inputFilePath).not.toContain('\\')
      expect(conversion?.originalFilename).toBe(expectedOriginalFilename)

      const resolvedPath = resolve(sandbox.root, 'data', 'conversions', conversion?.inputFilePath ?? '')
      const relativePath = relative(resolve(sandbox.root, 'data', 'conversions'), resolvedPath)

      expect(relativePath).not.toMatch(/^\.\./)
      expect(relativePath).not.toContain('..')
    }
  })

  it('rejects files with mismatched extension and content at the API level', async () => {
    const invalidUtf8 = await app.request
      .post('/api/upload')
      .field('conversionType', 'markdown-to-pdf')
      .attach('file', Buffer.from([0x48, 0x65, 0xff, 0x6c, 0x6f]), 'spoofed.md')
    const invalidUtf8Body = expectRecord(invalidUtf8.body as unknown)

    expect(invalidUtf8.status).toBe(400)
    expect(getString(invalidUtf8Body, 'error')).toBe('invalid_file')
    expect(getString(invalidUtf8Body, 'message')).toBe('File is not valid UTF-8 text.')

    const invalidDocx = await app.request
      .post('/api/upload')
      .field('conversionType', 'docx-to-markdown')
      .attach('file', Buffer.from('not a zip document', 'utf-8'), 'spoofed.docx')
    const invalidDocxBody = expectRecord(invalidDocx.body as unknown)

    expect(invalidDocx.status).toBe(400)
    expect(getString(invalidDocxBody, 'error')).toBe('invalid_file')
    expect(getString(invalidDocxBody, 'message')).toContain('Unable to detect file type')

    const conversions = await db.select().from(schema.conversions)
    expect(conversions).toHaveLength(0)

    const eventRows = await db.select().from(schema.conversionEvents)
    expect(eventRows).toHaveLength(0)
  })

  it('rejects files exceeding 10MB at the API level', async () => {
    const oversize = await app.request
      .post('/api/upload')
      .field('conversionType', 'markdown-to-pdf')
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1, 0x61), 'too-large.md')
    const oversizeBody = expectRecord(oversize.body as unknown)

    expect(oversize.status).toBe(413)
    expect(getString(oversizeBody, 'error')).toBe('file_too_large')

    const conversion = await db.query.conversions.findFirst({
      where: and(
        eq(schema.conversions.originalFilename, 'too-large.md'),
        eq(schema.conversions.conversionType, 'markdown-to-pdf'),
      ),
    })
    expect(conversion).toBeUndefined()
  })
})
