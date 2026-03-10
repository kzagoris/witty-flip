const MAX_ERROR_LENGTH = 500
const MAX_RAW_LENGTH = 2048

// Strip ANSI escape codes and server filesystem paths from error messages
export function sanitizeToolError(raw: string): string {
  // Truncate raw input before applying regexes to bound work
  const bounded = raw.length > MAX_RAW_LENGTH ? raw.slice(0, MAX_RAW_LENGTH) : raw

  let cleaned = bounded
    // Strip ANSI escape codes (ESC[ ... <letter>)
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    // Remove Windows absolute paths and UNC shares (preserve the final filename)
    .replace(/(?:[A-Za-z]:|\\\\[^\\\r\n]+\\[^\\\r\n]+)\\(?:[^\\\r\n]+\\)*[^\\\r\n]*/g, match => match.replace(/^.*\\/, ''))
    // Remove common server-side absolute paths (preserve the final filename)
    .replace(/\/(?:home|tmp|var|data|srv|opt|usr|etc)\/\S*/g, match => match.replace(/^.*\//, ''))
    .trim()

  if (cleaned.length > MAX_ERROR_LENGTH) {
    cleaned = cleaned.slice(0, MAX_ERROR_LENGTH) + '…'
  }

  return cleaned || 'Conversion failed'
}
