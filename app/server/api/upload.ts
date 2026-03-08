import path from 'node:path'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { setResponseStatus } from '@tanstack/react-start/server'
import { db } from '~/lib/db'
import { conversions } from '~/lib/db/schema'
import { getStoredInputFilename, ensureConversionsDir } from '~/lib/conversion-files'
import { getConversionBySlug } from '~/lib/conversions'
import { MAX_FILE_SIZE, validateFile } from '~/lib/file-validation'
import { checkAndConsumeRequestRateLimit } from '~/lib/request-rate-limit'
import { resolveClientIp, resolveClientIpFromRequest } from '~/lib/request-ip'
import { initializeServerRuntime } from '~/lib/server-runtime'
import { errorResult, type ApiErrorResponse, type ApiResult, type UploadResponse } from './contracts'

export async function processUpload(
  data: unknown,
  clientIp: string,
): Promise<ApiResult<UploadResponse | ApiErrorResponse>> {
  initializeServerRuntime()

  const requestLimit = checkAndConsumeRequestRateLimit(clientIp)
  if (!requestLimit.allowed) {
    return errorResult(429, 'request_rate_limited', 'Too many requests. Please wait a minute and try again.', {
      limit: requestLimit.limit,
      remaining: requestLimit.remaining,
      resetAt: requestLimit.resetAt,
    })
  }

  if (!(data instanceof FormData)) {
    return errorResult(400, 'invalid_form_data', 'A multipart form upload is required.')
  }

  const file = data.get('file')
  const conversionType = data.get('conversionType')

  if (!(file instanceof File)) {
    return errorResult(400, 'missing_file', 'Please choose a file to upload.')
  }

  if (typeof conversionType !== 'string') {
    return errorResult(400, 'missing_conversion_type', 'A conversion type is required.')
  }

  const conversion = getConversionBySlug(conversionType)
  if (!conversion) {
    return errorResult(400, 'invalid_conversion_type', 'The requested conversion type is not supported.')
  }

  if (file.size > MAX_FILE_SIZE) {
    return errorResult(413, 'file_too_large', 'Files must be 10MB or smaller.')
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const validation = await validateFile(buffer, file.name, conversionType)
  if (!validation.valid) {
    return errorResult(400, 'invalid_file', validation.error ?? 'The uploaded file is invalid.')
  }

  const fileId = randomUUID()
  const extension = path.extname(file.name).toLowerCase()
  const storedFilename = getStoredInputFilename(fileId, extension)
  const storedPath = path.join('data', 'conversions', storedFilename)

  try {
    await ensureConversionsDir()
    await fs.writeFile(path.resolve(storedPath), buffer)
  } catch {
    return errorResult(500, 'upload_write_failed', 'Unable to store the uploaded file right now.')
  }

  try {
    await db.insert(conversions).values({
      id: fileId,
      originalFilename: file.name,
      sourceFormat: conversion.sourceFormat,
      targetFormat: conversion.targetFormat,
      conversionType,
      ipAddress: clientIp,
      inputFilePath: storedFilename,
      inputFileSizeBytes: buffer.byteLength,
      status: 'uploaded',
    })
  } catch {
    await fs.rm(path.resolve(storedPath), { force: true }).catch(() => {})
    return errorResult(500, 'upload_record_failed', 'Unable to save the upload metadata right now.')
  }

  return {
    status: 200,
    body: {
      fileId,
      status: 'uploaded',
    },
  }
}

export async function handleUploadHttpRequest(
  request: Request,
  peerIp?: string,
): Promise<Response> {
  const result = await processUpload(
    await request.formData(),
    resolveClientIpFromRequest(request, peerIp),
  )
  return Response.json(result.body, { status: result.status })
}

export const uploadFile = createServerFn({ method: 'POST' }).handler(async ({ data }) => {
  const result = await processUpload(data, resolveClientIp())
  setResponseStatus(result.status)
  return result.body
})
