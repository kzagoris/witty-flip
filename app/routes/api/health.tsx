import { createFileRoute } from '@tanstack/react-router'
import { initializeServerRuntime } from '~/lib/server-runtime'

export function handleHealthRequest(): Response {
  initializeServerRuntime()
  return Response.json({ status: 'ok' }, { status: 200 })
}

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () => handleHealthRequest(),
    },
  },
})
