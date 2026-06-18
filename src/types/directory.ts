/**
 * Directory Contracts
 *
 * What this file does
 * -------------------
 * This file defines the contact, recipient-group, and directory import data
 * shapes used by the directory management screens.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the contact shapes first, then the group and membership shapes. That
 * reflects how the directory UI builds its tables and modals.
 *
 * When to change this file
 * ------------------------
 * Update this file when the directory backend changes its contact or group
 * schema.
 *
 * What this file does not do
 * --------------------------
 * This file does not perform directory lookups or validation. It only defines
 * the shared contracts.
 */

﻿/**
 * Module: Directory
 * Purpose: Core module responsible for Directory concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

export type ContactRole = 'approver' | 'recipient' | 'both'

export interface Contact {
  id: number
  display_name: string
  email: string
  whatsapp_number: string | null
  role: ContactRole
  is_default_approver: boolean
  active: boolean
  created_at: string
  updated_at: string
}

export interface ContactCreate {
  display_name: string
  email: string
  whatsapp_number?: string
  role: ContactRole
  active?: boolean
}

export interface ContactUpdate {
  display_name?: string
  email?: string
  whatsapp_number?: string
  role?: ContactRole
  active?: boolean
}

export interface RecipientGroup {
  id: number
  name: string
  description: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface RecipientGroupCreate {
  name: string
  description?: string
  active?: boolean
}

export interface RecipientGroupUpdate {
  name?: string
  description?: string
  active?: boolean
}

export interface GroupMembership {
  group_id: number
  contact_ids: number[]
}

export interface DirectoryImportResponse {
  created: number
  updated: number
  errors: string[]
}

