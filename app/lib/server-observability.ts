import type pino from 'pino'
import { createChildLogger } from '~/lib/logger'

export function createRequestLogger(
  route: string,
  requestId: string,
  bindings: Record<string, unknown> = {},
): pino.Logger {
  return createChildLogger({ route, requestId, ...bindings })
}
