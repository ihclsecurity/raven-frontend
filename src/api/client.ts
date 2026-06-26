/**
 * Shared HTTP Client
 *
 * What this file does
 * -------------------
 * This file creates the single Axios client used by the frontend. It keeps the
 * base URL, credential handling, and error normalization in one place so every
 * API module behaves consistently.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the client configuration first, then the response interceptor. The
 * interceptor is the important part because it converts backend error payloads
 * into messages that the UI can display safely.
 *
 * When to change this file
 * ------------------------
 * Update this file when the frontend needs a new transport-wide rule, such as
 * a different base path, a new auth-expiry behavior, or a better error format.
 *
 * What this file does not do
 * --------------------------
 * This file does not know about individual screens or feature workflows. It
 * only standardizes the shared HTTP transport.
 */

import axios, { AxiosHeaders } from 'axios'
import { apiBaseUrl } from './baseUrl'

export const AUTH_EXPIRED_EVENT = 'raven-auth-expired'
const AUTH_COOKIE_NAME = 'raven_auth'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null

  const prefix = `${encodeURIComponent(name)}=`
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))

  if (!match) return null

  return decodeURIComponent(match.slice(prefix.length))
}

const client = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

// Browsers do not allow frontend code to set the Cookie header directly.
// We keep withCredentials enabled for cookie-based auth and also mirror the
// stored auth token into Authorization for APIs that expect bearer auth.
client.interceptors.request.use((config) => {
  const token = readCookie(AUTH_COOKIE_NAME)
  if (!token) return config

  const headers = AxiosHeaders.from(config.headers || {})
  headers.set('Authorization', `bearer ${token}`)
  config.headers = headers

  return config
})

// The interceptor turns backend validation shapes into a single message and
// also broadcasts auth expiry so the rest of the app can clear private state.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    }

    const detail = error.response?.data?.detail
    let message = error.message || 'Unknown error'

    if (typeof detail === 'string' && detail.trim()) {
      message = detail
    } else if (Array.isArray(detail)) {
      const normalized = detail
        .map((item) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object') {
            const map = item as { msg?: unknown; loc?: unknown }
            const msg = typeof map.msg === 'string' ? map.msg : 'Validation error'
            const loc = Array.isArray(map.loc) ? map.loc.join('.') : ''
            return loc ? `${msg} (${loc})` : msg
          }
          return ''
        })
        .filter(Boolean)
      if (normalized.length > 0) {
        message = normalized.join('; ')
      }
    } else if (detail && typeof detail === 'object') {
      const obj = detail as { message?: unknown; msg?: unknown; error?: unknown }
      if (typeof obj.message === 'string' && obj.message.trim()) message = obj.message
      else if (typeof obj.msg === 'string' && obj.msg.trim()) message = obj.msg
      else if (typeof obj.error === 'string' && obj.error.trim()) message = obj.error
    }

    return Promise.reject(new Error(message))
  },
)

export default client

