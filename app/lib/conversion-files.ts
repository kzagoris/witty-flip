import path from 'node:path'
import fs from 'node:fs/promises'
import { getConversionBySlug } from '~/lib/conversions'

export const CONVERSIONS_DIR = path.resolve('data', 'conversions')

export function getStoredInputFilename(fileId: string, extension: string): string {
  return `${fileId}${extension}`
}

export function getStoredInputPath(inputFilePath: string): string {
  return path.join(CONVERSIONS_DIR, inputFilePath)
}

export function getStoredOutputFilename(fileId: string, targetExtension: string): string {
  return `${fileId}-output${targetExtension}`
}

export function getStoredOutputPath(fileId: string, targetExtension: string): string {
  return path.join(CONVERSIONS_DIR, getStoredOutputFilename(fileId, targetExtension))
}

export async function ensureConversionsDir(): Promise<void> {
  await fs.mkdir(CONVERSIONS_DIR, { recursive: true })
}

export function resolveOutputPath(
  fileId: string,
  conversionType: string,
  storedOutputFilePath: string | null,
): string | null {
  if (storedOutputFilePath) return storedOutputFilePath
  const meta = getConversionBySlug(conversionType)
  return meta ? getStoredOutputPath(fileId, meta.targetExtension) : null
}
