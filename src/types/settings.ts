/**
 * Settings Contracts
 *
 * What this file does
 * -------------------
 * This file defines the settings data shapes used by the admin screens and the
 * frontend helpers that parse stored configuration.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the settings record first, then the update payloads or parsed helper
 * shapes if they exist. The UI relies on this file to understand the settings
 * response.
 *
 * When to change this file
 * ------------------------
 * Update this file when the settings backend adds or removes a configuration
 * field.
 *
 * What this file does not do
 * --------------------------
 * This file does not save settings or choose defaults. It only defines the
 * shared data contract.
 */

﻿/**
 * Module: Settings
 * Purpose: Core module responsible for Settings concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

export interface AppSettings {
  default_template_id: string
  default_tone: string
  auto_save_interval_seconds: string
  incident_type_options_json: string
  severity_options_json: string
  confidence_options_json: string
  business_impact_options_json: string
  tone_options_json: string
  [key: string]: string
}

