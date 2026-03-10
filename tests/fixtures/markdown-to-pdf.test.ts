import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { pandocConverter } from '~/lib/converters/pandoc'
import { areToolsAvailable, createFixtureDir, ensureFixturesGenerated, expectPdfOutput, fixturePath, pathExists } from './helpers'

const describeIf = areToolsAvailable(['pandoc', 'weasyprint']) ? describe : describe.skip
const TEST_TIMEOUT_MS = 60_000

beforeAll(async () => {
  await ensureFixturesGenerated()
})

describeIf('fixture: markdown to pdf', () => {
  it('converts a markdown fixture to PDF', async () => {
    const root = createFixtureDir()
    const outputPath = path.join(root, 'output.pdf')
    const result = await pandocConverter.convert(
      fixturePath('markdown', 'simple-text.md'),
      outputPath,
      AbortSignal.timeout(TEST_TIMEOUT_MS),
    )

    expect(result.success, result.errorMessage).toBe(true)
    await expectPdfOutput(outputPath)
  }, TEST_TIMEOUT_MS)

  it('does not crash on an invalid UTF-8 markdown fixture', async () => {
    const root = createFixtureDir()
    const outputPath = path.join(root, 'output.pdf')
    const result = await pandocConverter.convert(
      fixturePath('markdown', 'corrupted.md'),
      outputPath,
      AbortSignal.timeout(TEST_TIMEOUT_MS),
    )

    expect(typeof result.success).toBe('boolean')
    if (result.success) {
      expect(await pathExists(outputPath)).toBe(true)
    }
  }, TEST_TIMEOUT_MS)
})
