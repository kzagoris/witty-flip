import pino from 'pino'
import { isProduction } from '~/lib/env'

const defaultLevel = isProduction ? 'info' : 'debug'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? defaultLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
        },
      }),
})

export function createChildLogger(bindings: Record<string, unknown>): pino.Logger {
  return logger.child(bindings)
}
