import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { pdflatexConverter } from '~/lib/converters/pdflatex'
import { areToolsAvailable, createFixtureDir, ensureFixturesGenerated, expectPdfOutput, fixturePath } from './helpers'

const describeIf = areToolsAvailable(['pdflatex']) ? describe : describe.skip
const TEST_TIMEOUT_MS = 60_000

beforeAll(async () => {
  await ensureFixturesGenerated()
})

describeIf('fixture: latex to pdf', () => {
  it('converts a LaTeX fixture to PDF', async () => {
    const root = createFixtureDir()
    const outputPath = path.join(root, 'output.pdf')
    const result = await pdflatexConverter.convert(
      fixturePath('latex', 'simple-text.tex'),
      outputPath,
      AbortSignal.timeout(TEST_TIMEOUT_MS),
    )

    expect(result.success, result.errorMessage).toBe(true)
    await expectPdfOutput(outputPath)
  }, TEST_TIMEOUT_MS)

  it('fails gracefully for a broken LaTeX fixture', async () => {
    const root = createFixtureDir()
    const outputPath = path.join(root, 'output.pdf')
    const result = await pdflatexConverter.convert(
      fixturePath('latex', 'corrupted.tex'),
      outputPath,
      AbortSignal.timeout(TEST_TIMEOUT_MS),
    )

    expect(result.success).toBe(false)
  }, TEST_TIMEOUT_MS)
})
