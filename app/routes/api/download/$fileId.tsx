import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { eq } from 'drizzle-orm'
import { createFileRoute } from '@tanstack/react-router'
import { db } from '~/lib/db'
import { conversions } from '~/lib/db/schema'
import { getStoredOutputPath } from '~/lib/conversion-files'
import { getConversionBySlug } from '~/lib/conversions'
import { checkAndConsumeRequestRateLimit } from '~/lib/request-rate-limit'
import { resolveClientIp } from '~/lib/request-ip'
import { initializeServerRuntime } from '~/lib/server-runtime'
import { errorResult, isUuid, normalizeConversionStatus } from '~/server/api/contracts'

function sanitizeDownloadFilename(originalFilename: string, targetExtension: string) {
  const basename = path.parse(originalFilename).name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\p{Cc}/gu, '')
    .trim()

  const readableBase = basename || 'converted-file'
  const fullName = `${readableBase}${targetExtension}`
  const asciiFallback = fullName
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_')

  return {
    fallback: asciiFallback || `converted-file${targetExtension}`,
    encoded: encodeURIComponent(fullName),
  }
}

export async function handleDownloadRequest(
  fileId: string,
  clientIp?: string,
): Promise<Response> {
  initializeServerRuntime()

  if (clientIp) {
    const requestLimit = checkAndConsumeRequestRateLimit(clientIp)
    if (!requestLimit.allowed) {
      const result = errorResult(429, 'request_rate_limited', 'Too many requests. Please wait a minute and try again.', {
        limit: requestLimit.limit,
        remaining: requestLimit.remaining,
        resetAt: requestLimit.resetAt,
      })
      return Response.json(result.body, { status: result.status })
    }
  }

  if (!isUuid(fileId)) {
    const result = errorResult(400, 'invalid_file_id', 'A valid fileId is required.')
    return Response.json(result.body, { status: result.status })
  }

  const conversion = await db.query.conversions.findFirst({
    where: eq(conversions.id, fileId),
  })

  if (!conversion) {
    const result = errorResult(404, 'not_found', 'Conversion not found.', { fileId })
    return Response.json(result.body, { status: result.status })
  }

  const conversionStatus = normalizeConversionStatus(conversion.status)

  if (
    conversionStatus === 'expired'
    || (conversion.expiresAt && new Date(conversion.expiresAt).getTime() <= Date.now())
  ) {
    await db
      .update(conversions)
      .set({ status: 'expired' })
      .where(eq(conversions.id, fileId))

    const result = errorResult(410, 'expired', 'The download window has expired.', {
      fileId,
      status: 'expired',
    })
    return Response.json(result.body, { status: result.status })
  }

  if (conversionStatus !== 'completed') {
    const result = errorResult(404, 'not_ready', 'The converted file is not available for download yet.', {
      fileId,
      status: conversionStatus,
    })
    return Response.json(result.body, { status: result.status })
  }

  const conversionMeta = getConversionBySlug(conversion.conversionType)
  if (!conversionMeta) {
    const result = errorResult(500, 'conversion_metadata_missing', 'Conversion metadata is unavailable.', {
      fileId,
      status: 'failed',
    })
    return Response.json(result.body, { status: result.status })
  }

  const outputPath = getStoredOutputPath(fileId, conversionMeta.targetExtension)

  let handle: fs.FileHandle
  try {
    handle = await fs.open(outputPath, 'r')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const result = errorResult(404, 'artifact_missing', 'The converted file is no longer available.', {
        fileId,
        status: 'completed',
      })
      return Response.json(result.body, { status: result.status })
    }
    throw error
  }

  const stat = await handle.stat()
  const filename = sanitizeDownloadFilename(conversion.originalFilename, conversionMeta.targetExtension)
  const stream = handle.createReadStream()
  stream.on('close', () => {
    void handle.close().catch(() => {})
  })

  return new Response(Readable.toWeb(stream) as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': conversionMeta.targetMimeType,
      'Content-Length': String(stat.size),
      'Content-Disposition':
        `attachment; filename="${filename.fallback}"; filename*=UTF-8''${filename.encoded}`,
    },
  })
}

export const Route = createFileRoute('/api/download/$fileId')({
  server: {
    handlers: {
      GET: async ({ params }) => handleDownloadRequest(params.fileId, resolveClientIp()),
    },
  },
})
