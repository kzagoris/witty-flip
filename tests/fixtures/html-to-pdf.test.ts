import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { weasyprintConverter } from '~/lib/converters/weasyprint'
import { areToolsAvailable, createFixtureDir, ensureFixturesGenerated, expectPdfOutput, fixturePath } from './helpers'

const describeIf = areToolsAvailable(['weasyprint']) ? describe : describe.skip
const TEST_TIMEOUT_MS = 60_000

beforeAll(async () => {
  await ensureFixturesGenerated()
})

describeIf('fixture: html to pdf', () => {
  it('converts an HTML fixture to PDF', async () => {
    const root = createFixtureDir()
    const outputPath = path.join(root, 'output.pdf')
    const result = await weasyprintConverter.convert(
      fixturePath('html', 'simple-text.html'),
      outputPath,
      AbortSignal.timeout(TEST_TIMEOUT_MS),
    )

    expect(result.success, result.errorMessage).toBe(true)
    await expectPdfOutput(outputPath)
  }, TEST_TIMEOUT_MS)

  it('does not crash on a corrupted HTML fixture', async () => {
    const root = createFixtureDir()
    const outputPath = path.join(root, 'output.pdf')
    const result = await weasyprintConverter.convert(
      fixturePath('html', 'corrupted.html'),
      outputPath,
      AbortSignal.timeout(TEST_TIMEOUT_MS),
    )

    expect(typeof result.success).toBe('boolean')
  }, TEST_TIMEOUT_MS)
})
