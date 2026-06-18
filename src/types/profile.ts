/**
 * Profile Contracts
 *
 * What this file does
 * -------------------
 * This file defines the current-user profile data shapes used by the profile
 * screens and related account flows.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the base profile shape first, then any update payloads. That matches the
 * way the profile UI edits a user record.
 *
 * When to change this file
 * ------------------------
 * Update this file when the profile backend changes the account fields.
 *
 * What this file does not do
 * --------------------------
 * This file does not fetch profile data or enforce permissions.
 */

﻿/**
 * Module: Profile
 * Purpose: Core module responsible for Profile concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

export interface AnalystProfile {
  id: number
  display_name: string
  email: string | null
  timezone: string
  analyst_role: 'analyst' | 'reviewer' | 'admin'
  created_at: string
  updated_at: string
}

