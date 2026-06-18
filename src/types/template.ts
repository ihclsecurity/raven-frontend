/**
 * Template Contracts
 *
 * What this file does
 * -------------------
 * This file defines the shared template data shapes used by compose, preview,
 * and advisory generation flows.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the template record first, then any create or update payloads. That is
 * the same sequence used by the template editor screens.
 *
 * When to change this file
 * ------------------------
 * Update this file when the backend template schema changes or when new
 * template metadata is introduced.
 *
 * What this file does not do
 * --------------------------
 * This file does not render templates or decide which one is active. It only
 * defines the shared contract.
 */

﻿/**
 * Module: Template
 * Purpose: Core module responsible for Template concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

export type TemplateType = 'notification' | 'summary'

export interface Template {
  id: number
  name: string
  type: TemplateType
  category: string | null
  owner: string | null
  body_instructions: string
  required_metadata_json: string | null
  default_tone: string | null
  active: boolean
  version: number
  version_notes: string | null
  created_at: string
  updated_at: string
}

export interface TemplateCreate {
  name: string
  type: TemplateType
  category?: string
  owner?: string
  body_instructions: string
  required_metadata_json?: string
  default_tone?: string
  version_notes: string
}

export interface TemplateUpdate extends TemplateCreate {
  active?: boolean
}

