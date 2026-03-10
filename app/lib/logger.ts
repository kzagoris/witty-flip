import '~/lib/load-env'
import pino from 'pino'
import { isProduction } from '~/lib/env'

const isTest = process.env.VITEST === 'true'
const defaultLevel = isTest ? 'silent' : isProduction ? 'info' : 'debug'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? defaultLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
  },
  ...(isProduction || isTest
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
