import { mkdtempSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect } from 'vitest'
import { registerTempRoot } from '../setup'

let fixturesEnsured = false

export function isToolAvailable(toolName: string): boolean {
  try {
    const result = spawnSync(toolName, ['--version'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    return result.status === 0
  } catch {
    return false
  }
}

export function areToolsAvailable(toolNames: string[]): boolean {
  const results = toolNames.map(isToolAvailable)
  return results.every(Boolean)
}

export function createFixtureDir(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'wittyflip-fixture-'))
  registerTempRoot(root)
  return root
}

export function fixturePath(category: string, filename: string): string {
  return path.resolve('tests', 'fixtures', 'samples', category, filename)
}

export function fixtureExists(category: string, filename: string): boolean {
  return existsSync(fixturePath(category, filename))
}

export async function ensureFixturesGenerated(): Promise<void> {
  if (fixturesEnsured && fixtureExists('markdown', 'simple-text.md')) {
    return
  }

  const result = spawnSync(process.execPath, [path.resolve('scripts', 'generate-fixtures.mjs')], {
    cwd: path.resolve('.'),
    stdio: 'pipe',
    windowsHide: true,
  })

  if (result.status !== 0) {
    throw new Error(result.stderr.toString('utf-8') || 'Failed to generate fixtures.')
  }

  fixturesEnsured = true
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function expectOutputExists(filePath: string): Promise<void> {
  const stats = await fs.stat(filePath)
  expect(stats.size).toBeGreaterThan(0)
}

export async function expectPdfOutput(filePath: string): Promise<void> {
  await expectOutputExists(filePath)
  const pdf = await fs.readFile(filePath)
  expect(pdf.subarray(0, 4).toString('ascii')).toBe('%PDF')
}

export async function expectMobiOutput(filePath: string): Promise<void> {
  await expectOutputExists(filePath)
  const output = await fs.readFile(filePath)
  expect(output.includes(Buffer.from('BOOKMOBI', 'ascii'))).toBe(true)
}

export async function expectOutputContains(filePath: string, text: string): Promise<void> {
  await expectOutputExists(filePath)
  const output = await fs.readFile(filePath, 'utf-8')
  expect(output).toContain(text)
}

export async function expectZipEntry(filePath: string, entryPrefix: string): Promise<void> {
  await expectOutputExists(filePath)
  const output = await fs.readFile(filePath)
  const marker = Buffer.from(entryPrefix, 'utf-8')
  expect(output.includes(marker)).toBe(true)
}
