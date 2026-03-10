import fs from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { pandocConverter } from '~/lib/converters/pandoc'
import { areToolsAvailable, createFixtureDir, ensureFixturesGenerated, expectOutputContains, fixturePath } from './helpers'

const describeIf = areToolsAvailable(['pandoc']) ? describe : describe.skip
const TEST_TIMEOUT_MS = 60_000

beforeAll(async () => {
  await ensureFixturesGenerated()
})

describeIf('fixture: docx to markdown', () => {
  it('converts a simple DOCX fixture to markdown', async () => {
    const root = createFixtureDir()
    const outputPath = path.join(root, 'output.md')
    const result = await pandocConverter.convert(
      fixturePath('docx', 'simple-text.docx'),
      outputPath,
      AbortSignal.timeout(TEST_TIMEOUT_MS),
    )

    expect(result.success, result.errorMessage).toBe(true)
    await expectOutputContains(outputPath, 'Hello from DOCX fixture')
  }, TEST_TIMEOUT_MS)

  it('fails gracefully for a corrupted DOCX fixture', async () => {
    const root = createFixtureDir()
    const outputPath = path.join(root, 'output.md')
    const result = await pandocConverter.convert(
      fixturePath('docx', 'corrupted.docx'),
      outputPath,
      AbortSignal.timeout(TEST_TIMEOUT_MS),
    )

    expect(result.success).toBe(false)
    await expect(fs.access(outputPath)).rejects.toThrow()
  }, TEST_TIMEOUT_MS)
})
