/**
 * Email Group Contracts
 *
 * What this file does
 * -------------------
 * This file defines the TypeScript contracts for branded email groups and the
 * property lookup options used by the editor.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the group input shape first, then the property option shape. That order
 * matches the way the email group editor assembles a group.
 *
 * When to change this file
 * ------------------------
 * Update this file when the email-group backend changes its payload shape.
 *
 * What this file does not do
 * --------------------------
 * This file does not manage membership or brand logic. It only defines the
 * shared data contract.
 */

export type EmailGroupPropertyOption = {
  name: string
  city?: string | null
  state?: string | null
  region?: string | null
  country?: string | null
}

export type EmailGroupMember = {
  id: number
  email: string
  display_name?: string | null
  properties: string[]
  primary_property?: string | null
  is_email_valid: boolean
  warning_badge?: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export type EmailGroup = {
  id: number
  name: string
  description?: string | null
  active: boolean
  created_at: string
  updated_at: string
  members: EmailGroupMember[]
}

export type EmailGroupMemberInput = {
  email: string
  display_name?: string | null
  properties: string[]
  primary_property?: string | null
  active?: boolean
}

export type EmailGroupInput = {
  name: string
  description?: string | null
  active?: boolean
  members: EmailGroupMemberInput[]
}
