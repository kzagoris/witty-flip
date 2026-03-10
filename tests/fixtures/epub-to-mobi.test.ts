import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calibreConverter } from '~/lib/converters/calibre'
import { areToolsAvailable, createFixtureDir, ensureFixturesGenerated, expectMobiOutput, fixturePath } from './helpers'

const describeIf = areToolsAvailable(['ebook-convert']) ? describe : describe.skip
const TEST_TIMEOUT_MS = 60_000

beforeAll(async () => {
  await ensureFixturesGenerated()
})

describeIf('fixture: epub to mobi', () => {
  it('converts an EPUB fixture to MOBI', async () => {
    const root = createFixtureDir()
    const outputPath = path.join(root, 'output.mobi')
    const result = await calibreConverter.convert(
      fixturePath('epub', 'simple-text.epub'),
      outputPath,
      AbortSignal.timeout(TEST_TIMEOUT_MS),
    )

    expect(result.success, result.errorMessage).toBe(true)
    await expectMobiOutput(outputPath)
  }, TEST_TIMEOUT_MS)

  it('fails gracefully for a corrupted EPUB fixture', async () => {
    const root = createFixtureDir()
    const outputPath = path.join(root, 'output.mobi')
    const result = await calibreConverter.convert(
      fixturePath('epub', 'corrupted.epub'),
      outputPath,
      AbortSignal.timeout(TEST_TIMEOUT_MS),
    )

    expect(result.success).toBe(false)
  }, TEST_TIMEOUT_MS)
})
