export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError()
  }
}

export function createAbortError(): Error {
  if (typeof DOMException === 'function') {
    return new DOMException('The conversion was aborted.', 'AbortError')
  }

  const error = new Error('The conversion was aborted.')
  Object.defineProperty(error, 'name', { value: 'AbortError' })
  return error
}
