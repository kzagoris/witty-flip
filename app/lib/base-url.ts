export function resolveBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }

  const configuredBaseUrl = process.env.BASE_URL?.trim()
  return configuredBaseUrl && configuredBaseUrl !== '/'
    ? configuredBaseUrl.replace(/\/$/, '')
    : 'https://wittyflip.com'
}
