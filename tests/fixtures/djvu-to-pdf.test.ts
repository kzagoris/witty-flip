import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { djvulibreConverter } from '~/lib/converters/djvulibre'
import { areToolsAvailable, createFixtureDir, ensureFixturesGenerated, expectPdfOutput, fixtureExists, fixturePath } from './helpers'

const describeIf = areToolsAvailable(['ddjvu']) ? describe : describe.skip
const TEST_TIMEOUT_MS = 60_000

beforeAll(async () => {
  await ensureFixturesGenerated()
})

describeIf('fixture: djvu to pdf', () => {
  it.skipIf(!fixtureExists('djvu', 'simple-page.djvu'))('converts a DjVu fixture to PDF', async () => {
    const root = createFixtureDir()
    const outputPath = path.join(root, 'output.pdf')
    const result = await djvulibreConverter.convert(
      fixturePath('djvu', 'simple-page.djvu'),
      outputPath,
      AbortSignal.timeout(TEST_TIMEOUT_MS),
    )

    expect(result.success, result.errorMessage).toBe(true)
    await expectPdfOutput(outputPath)
  }, TEST_TIMEOUT_MS)

  it('fails gracefully for a corrupted DjVu fixture', async () => {
    const root = createFixtureDir()
    const outputPath = path.join(root, 'output.pdf')
    const result = await djvulibreConverter.convert(
      fixturePath('djvu', 'corrupted.djvu'),
      outputPath,
      AbortSignal.timeout(TEST_TIMEOUT_MS),
    )

    expect(result.success).toBe(false)
  }, TEST_TIMEOUT_MS)
})
