import type { ApiErrorResponse } from '~/server/api/contracts'

export type ApiCallResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiErrorResponse }

type ServerFnWithoutData<T> = () => Promise<T | ApiErrorResponse>
type ServerFnWithData<T> = (args: { data: unknown }) => Promise<T | ApiErrorResponse>

export async function callServerFn<T>(
  fn: ServerFnWithoutData<T> | ServerFnWithData<T>,
  data?: unknown,
): Promise<ApiCallResult<T>> {
  try {
    const result = await (
      data !== undefined
        ? (fn as ServerFnWithData<T>)({ data })
        : (fn as ServerFnWithoutData<T>)()
    )
    // If the result looks like an error response, treat it as an error
    if (isApiError(result)) {
      return { ok: false, error: result }
    }
    return { ok: true, data: result as T }
  } catch (err: unknown) {
    // TanStack Start throws when setResponseStatus(4xx) is used
    if (isApiError(err)) {
      return { ok: false, error: err }
    }

    // Try to extract JSON error from response-like objects
    if (err instanceof Error) {
      return {
        ok: false,
        error: {
          error: 'request_failed',
          message: err.message || 'Request failed. Please try again.',
        },
      }
    }

    return {
      ok: false,
      error: {
        error: 'unknown_error',
        message: 'An unexpected error occurred. Please try again.',
      },
    }
  }
}

function isApiError(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === 'object'
    && value !== null
    && 'error' in value
    && 'message' in value
    && typeof (value as Record<string, unknown>).error === 'string'
    && typeof (value as Record<string, unknown>).message === 'string'
  )
}
