import { registerAllConverters } from '~/lib/converters/register-all'

let initialized = false

export function initializeServerRuntime(): void {
  if (initialized) return

  registerAllConverters()
  initialized = true
}
