/**
 * Branding Constants
 *
 * This file centralizes the Raven logo asset paths so the shell and other UI
 * pieces can switch branding without hard-coding filenames in multiple places.
 *
 * It is responsible for:
 * - exposing the light and dark logo paths
 * - returning the correct logo for the active theme
 *
 * What this file does not do:
 * - it does not load images dynamically
 * - it does not manage theme state itself
 */
export const RAVEN_LOGO_LIGHT_PATH = "/Raven_main_logo_light_.png"
export const RAVEN_LOGO_DARK_PATH = "/Raven_main_logo_dark_.png"
const THEME_STORAGE_KEY = 'raven-theme-mode'

export function getRavenLogoPath(theme: 'light' | 'dark'): string {
  return theme === 'dark' ? RAVEN_LOGO_DARK_PATH : RAVEN_LOGO_LIGHT_PATH
}

export function getStoredRavenLogoPath(): string {
  if (typeof window === 'undefined') {
    return RAVEN_LOGO_DARK_PATH
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return getRavenLogoPath(storedTheme)
  }

  return getRavenLogoPath(window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
}
