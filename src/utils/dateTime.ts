/**
 * Application Date and Time Helpers
 *
 * What this file does
 * -------------------
 * This file normalizes backend timestamps and formats them in the application
 * timezone so the UI shows a consistent date and time experience.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the parsing helper first, then the formatting helpers. The parsing
 * function is the important one because many backend values arrive without an
 * explicit timezone.
 *
 * When to change this file
 * ------------------------
 * Update this file when the app timezone, locale, or backend timestamp format
 * changes.
 *
 * What this file does not do
 * --------------------------
 * This file does not fetch dates or decide how timestamps should be stored.
 */

const APP_TIME_ZONE = 'Asia/Kolkata'
const APP_LOCALE = 'en-IN'
const HAS_TIME_ZONE_PATTERN = /(?:z|[+-]\d{2}:?\d{2})$/i

export function parseApiDate(value: string | null | undefined): Date | null {
  const raw = String(value || '').trim()
  if (!raw) return null

  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const withZone = HAS_TIME_ZONE_PATTERN.test(normalized) ? normalized : `${normalized}Z`
  const date = new Date(withZone)
  return Number.isNaN(date.getTime()) ? null : date
}

export function apiTime(value: string | null | undefined): number {
  return parseApiDate(value)?.getTime() || 0
}

export function formatAppDateTime(value: string | null | undefined, fallback = 'Not available'): string {
  const date = parseApiDate(value)
  if (!date) return fallback
  return new Intl.DateTimeFormat(APP_LOCALE, {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: APP_TIME_ZONE,
  }).format(date)
}

export function formatAppTime(value: Date | number = Date.now()): string {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat(APP_LOCALE, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone: APP_TIME_ZONE,
  }).format(date)
}

export function formatAppDate(value: Date | number = Date.now(), options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    ...options,
  }).format(date)
}
