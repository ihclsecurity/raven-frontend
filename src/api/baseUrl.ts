const configuredBackendUrl = (import.meta.env.VITE_BACKEND_URL || __APP_BACKEND_URL__ || '').trim()

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export const backendUrl = stripTrailingSlash(configuredBackendUrl)
export const apiBaseUrl = backendUrl ? `${backendUrl}/api` : '/api'

export function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return backendUrl ? `${backendUrl}${normalizedPath}` : normalizedPath
}
