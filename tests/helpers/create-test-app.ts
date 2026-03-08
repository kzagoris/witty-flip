import http from 'node:http'
import { IncomingMessage, ServerResponse } from 'node:http'
import supertest from 'supertest'

function getHeaderValue(
  headers: IncomingMessage['headers'],
  name: string,
): string | undefined {
  const value = headers[name]
  if (Array.isArray(value)) return value[0]
  return value
}

function createRequestFromNode(req: IncomingMessage): Request {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const headers = new Headers()

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      value.forEach(entry => headers.append(key, entry))
    } else if (value !== undefined) {
      headers.set(key, value)
    }
  }

  const init: RequestInit & { duplex?: 'half' } = {
    method: req.method,
    headers,
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req as unknown as BodyInit
    init.duplex = 'half'
  }

  return new Request(url, init)
}

async function sendFetchResponse(response: Response, nodeResponse: ServerResponse): Promise<void> {
  nodeResponse.statusCode = response.status
  response.headers.forEach((value, key) => {
    nodeResponse.setHeader(key, value)
  })

  const body = response.body
  if (!body) {
    nodeResponse.end()
    return
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  nodeResponse.end(buffer)
}

export interface TestApp {
  request: ReturnType<typeof supertest>
  close(): Promise<void>
}

export async function createTestApp(): Promise<TestApp> {
  const [
    uploadModule,
    convertModule,
    statusModule,
    rateLimitModule,
    checkoutModule,
    downloadModule,
    webhookModule,
    healthModule,
  ] = await Promise.all([
    import('~/server/api/upload'),
    import('~/server/api/convert'),
    import('~/server/api/conversion-status'),
    import('~/server/api/rate-limit-status'),
    import('~/server/api/create-checkout'),
    import('~/routes/api/download/$fileId'),
    import('~/routes/api/webhook/stripe'),
    import('~/routes/api/health'),
  ])

  const server = http.createServer((req, res) => {
    void (async () => {
      const request = createRequestFromNode(req)
      const peerIp = getHeaderValue(req.headers, 'x-test-peer-ip') ?? req.socket.remoteAddress ?? '127.0.0.1'
      const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname

      let response: Response

      if (req.method === 'POST' && pathname === '/api/upload') {
        response = await uploadModule.handleUploadHttpRequest(request, peerIp)
      } else if (req.method === 'POST' && pathname === '/api/convert') {
        response = await convertModule.handleConvertHttpRequest(request, peerIp)
      } else if (req.method === 'POST' && pathname === '/api/create-checkout') {
        response = await checkoutModule.handleCreateCheckoutHttpRequest(request, peerIp)
      } else if (req.method === 'GET' && pathname === '/api/rate-limit-status') {
        response = await rateLimitModule.handleRateLimitStatusHttpRequest(request, peerIp)
      } else if (req.method === 'GET' && /^\/api\/conversion\/[^/]+\/status$/.test(pathname)) {
        const fileId = pathname.split('/')[3]
        response = await statusModule.handleConversionStatusHttpRequest(request, fileId, peerIp)
      } else if (req.method === 'GET' && /^\/api\/download\/[^/]+$/.test(pathname)) {
        const fileId = pathname.split('/')[3]
        response = await downloadModule.handleDownloadRequest(fileId, peerIp)
      } else if (req.method === 'POST' && pathname === '/api/webhook/stripe') {
        response = await webhookModule.handleStripeWebhookRequest(request)
      } else if (req.method === 'GET' && pathname === '/api/health') {
        response = healthModule.handleHealthRequest()
      } else {
        response = Response.json({ error: 'not_found', message: 'Not found.' }, { status: 404 })
      }

      await sendFetchResponse(response, res)
    })().catch((error: unknown) => {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({
        error: 'test_app_error',
        message: error instanceof Error ? error.message : 'Unknown test app error.',
      }))
    })
  })

  return {
    request: supertest(server),
    close: () => new Promise<void>((resolve, reject) => {
      if (!server.listening) {
        resolve()
        return
      }

      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    }),
  }
}
