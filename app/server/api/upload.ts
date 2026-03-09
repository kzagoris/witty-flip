import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { errorResult, type ApiErrorResponse, type ApiResult, type UploadResponse } from './contracts'

interface UploadServerDeps {
  pathModule: typeof import('node:path')
  fsModule: typeof import('node:fs/promises')
  randomUUID: typeof import('node:crypto').randomUUID
  db: typeof import('~/lib/db').db
  conversions: typeof import('~/lib/db/schema').conversions
  getStoredInputFilename: typeof import('~/lib/conversion-files').getStoredInputFilename
  ensureConversionsDir: typeof import('~/lib/conversion-files').ensureConversionsDir
  getConversionBySlug: typeof import('~/lib/conversions').getConversionBySlug
  MAX_FILE_SIZE: typeof import('~/lib/file-validation').MAX_FILE_SIZE
  validateFile: typeof import('~/lib/file-validation').validateFile
  checkAndConsumeRequestRateLimit: typeof import('~/lib/request-rate-limit').checkAndConsumeRequestRateLimit
  initializeServerRuntime: typeof import('~/lib/server-runtime').initializeServerRuntime
}

let uploadServerDepsPromise: Promise<UploadServerDeps> | undefined

const getUploadServerDeps = createServerOnlyFn(async (): Promise<UploadServerDeps> => {
  uploadServerDepsPromise ??= Promise.all([
    import('node:path'),
    import('node:fs/promises'),
    import('node:crypto'),
    import('~/lib/db'),
    import('~/lib/db/schema'),
    import('~/lib/conversion-files'),
    import('~/lib/conversions'),
    import('~/lib/file-validation'),
    import('~/lib/request-rate-limit'),
    import('~/lib/server-runtime'),
  ]).then(([
    pathModule,
    fsModule,
    cryptoModule,
    dbModule,
    schemaModule,
    conversionFilesModule,
    conversionsModule,
    fileValidationModule,
    requestRateLimitModule,
    serverRuntimeModule,
  ]) => ({
    pathModule,
    fsModule,
    randomUUID: cryptoModule.randomUUID,
    db: dbModule.db,
    conversions: schemaModule.conversions,
    getStoredInputFilename: conversionFilesModule.getStoredInputFilename,
    ensureConversionsDir: conversionFilesModule.ensureConversionsDir,
    getConversionBySlug: conversionsModule.getConversionBySlug,
    MAX_FILE_SIZE: fileValidationModule.MAX_FILE_SIZE,
    validateFile: fileValidationModule.validateFile,
    checkAndConsumeRequestRateLimit: requestRateLimitModule.checkAndConsumeRequestRateLimit,
    initializeServerRuntime: serverRuntimeModule.initializeServerRuntime,
  }))

  return uploadServerDepsPromise
})

interface UploadRequestContextDeps {
  setResponseStatus: typeof import('@tanstack/react-start/server').setResponseStatus
  resolveClientIp: typeof import('~/lib/request-ip').resolveClientIp
  resolveClientIpFromRequest: typeof import('~/lib/request-ip').resolveClientIpFromRequest
}

let uploadRequestContextPromise: Promise<UploadRequestContextDeps> | undefined

const getUploadRequestContext = createServerOnlyFn(async (): Promise<UploadRequestContextDeps> => {
  uploadRequestContextPromise ??= Promise.all([
    import('@tanstack/react-start/server'),
    import('~/lib/request-ip'),
  ]).then(([serverModule, requestIpModule]) => ({
    setResponseStatus: serverModule.setResponseStatus,
    resolveClientIp: requestIpModule.resolveClientIp,
    resolveClientIpFromRequest: requestIpModule.resolveClientIpFromRequest,
  }))

  return uploadRequestContextPromise
})

export async function processUpload(
  data: unknown,
  clientIp: string,
): Promise<ApiResult<UploadResponse | ApiErrorResponse>> {
  const {
    pathModule,
    fsModule,
    randomUUID,
    db,
    conversions,
    getStoredInputFilename,
    ensureConversionsDir,
    getConversionBySlug,
    MAX_FILE_SIZE,
    validateFile,
    checkAndConsumeRequestRateLimit,
    initializeServerRuntime,
  } = await getUploadServerDeps()

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
  const extension = pathModule.extname(file.name).toLowerCase()
  const storedFilename = getStoredInputFilename(fileId, extension)
  const storedPath = pathModule.join('data', 'conversions', storedFilename)

  try {
    await ensureConversionsDir()
    await fsModule.writeFile(pathModule.resolve(storedPath), buffer)
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
    await fsModule.rm(pathModule.resolve(storedPath), { force: true }).catch(() => {})
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
  const { resolveClientIpFromRequest } = await getUploadRequestContext()

  const result = await processUpload(
    await request.formData(),
    resolveClientIpFromRequest(request, peerIp),
  )
  return Response.json(result.body, { status: result.status })
}

export const uploadFile = createServerFn({ method: 'POST' }).handler(async ({ data }) => {
  const { setResponseStatus, resolveClientIp } = await getUploadRequestContext()

  const result = await processUpload(data, resolveClientIp())
  setResponseStatus(result.status)
  return result.body
})
