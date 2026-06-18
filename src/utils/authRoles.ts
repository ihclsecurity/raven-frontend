/**
 * Role Helpers
 *
 * What this file does
 * -------------------
 * This file centralizes the role checks used by the sidebar, route guard, and
 * any screen that needs to distinguish analysts, admins, and superadmins.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the role list first, then the boolean helpers, and finally the label
 * helper. The order matches how the UI uses these helpers.
 *
 * When to change this file
 * ------------------------
 * Update this file when the access model changes or when a new role needs to
 * be shown in the UI.
 *
 * What this file does not do
 * --------------------------
 * This file does not store permissions or authenticate users. It only provides
 * simple role checks and display labels.
 */

import type { AuthUser, AuthUserRole } from '../types/auth'

export const FULL_ACCESS_ROLES: AuthUserRole[] = ['admin', 'superadmin']

export function hasFullAccess(user: AuthUser | null | undefined): boolean {
  return Boolean(user && FULL_ACCESS_ROLES.includes(user.role))
}

export function isSuperadmin(user: AuthUser | null | undefined): boolean {
  return Boolean(user && user.role === 'superadmin')
}

export function roleLabel(role: AuthUserRole): string {
  if (role === 'superadmin') return 'Superadmin'
  if (role === 'admin') return 'Analyst / Admin'
  return 'User'
}
