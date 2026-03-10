import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { pandocConverter } from '~/lib/converters/pandoc'
import { areToolsAvailable, createFixtureDir, ensureFixturesGenerated, expectZipEntry, fixturePath } from './helpers'

const describeIf = areToolsAvailable(['pandoc']) ? describe : describe.skip
const TEST_TIMEOUT_MS = 60_000

beforeAll(async () => {
  await ensureFixturesGenerated()
})

describeIf('fixture: odt to docx', () => {
  it('converts an ODT fixture to DOCX', async () => {
    const root = createFixtureDir()
    const outputPath = path.join(root, 'output.docx')
    const result = await pandocConverter.convert(
      fixturePath('odt', 'simple-text.odt'),
      outputPath,
      AbortSignal.timeout(TEST_TIMEOUT_MS),
    )

    expect(result.success, result.errorMessage).toBe(true)
    await expectZipEntry(outputPath, 'word/')
  }, TEST_TIMEOUT_MS)

  it('fails gracefully for a corrupted ODT fixture', async () => {
    const root = createFixtureDir()
    const outputPath = path.join(root, 'output.docx')
    const result = await pandocConverter.convert(
      fixturePath('odt', 'corrupted.odt'),
      outputPath,
      AbortSignal.timeout(TEST_TIMEOUT_MS),
    )

    expect(result.success).toBe(false)
  }, TEST_TIMEOUT_MS)
})
