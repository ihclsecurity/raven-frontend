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
export const RAVEN_LOGO_LIGHT_PATH = "/Raven Light.png"
export const RAVEN_LOGO_DARK_PATH = "/Raven Dark.png"

export function getRavenLogoPath(theme: 'light' | 'dark'): string {
  return theme === 'dark' ? RAVEN_LOGO_DARK_PATH : RAVEN_LOGO_LIGHT_PATH
}