/**
 * Datasurfr Contracts
 *
 * What this file does
 * -------------------
 * This file defines the TypeScript contracts for Datasurfr alerts, map
 * properties, and import responses.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the alert and property shapes first, then the import response types.
 * The UI uses these contracts when it renders the feed and map screens.
 *
 * When to change this file
 * ------------------------
 * Update this file when the Datasurfr backend changes its feed, map, or import
 * payloads.
 *
 * What this file does not do
 * --------------------------
 * This file does not derive or filter alerts. It only defines their shape.
 */

﻿/**
 * Module: Datasurfr
 * Purpose: Core module responsible for Datasurfr concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

export interface DatasurfrAlert {
  id: string
  event_title: string
  event_description: string | null
  event_date: string | null
  event_location: string | null
  incident_type?: string | null
  risk_category: string | null
  sub_risk_category_name: string | null
  latitude: number | null
  longitude: number | null
  latest_update: string | null
  latest_update_local: string | null
  latest_update_age_minutes: number | null
  hotel_impact_score: number
  hotel_impact_level: 'high' | 'medium' | 'low'
  hotel_impact_reasons: string[]
  impact_radius_km: number
  language: string | null
  source_links: string[]
  mapped_regions: string[]
  primary_mapped_region?: string | null
  impacted_property_count: number
  impacted_properties_preview: string[]
  impacted_properties_all: string[]
  impact_scope: 'Local' | 'State' | 'National' | string
  impact_scope_states: string[]
  impact_scope_countries: string[]
  impact_scope_confidence: 'high' | 'medium' | 'low' | string | null
  impact_scope_reason: string | null
  previously_imported: boolean
  prior_import_count: number
  external_feed_kind?: 'business' | 'security'
  external_feed_label?: string | null
  external_feed_url?: string | null
  external_feed_scope?: 'India' | 'International' | string | null
  external_feed_coverage_tags?: string[]
  external_feed_coverage_labels?: string[]
  external_feed_canonical_url?: string | null
  external_feed_freshness_status?: string | null
  external_feed_duplicate_count?: number
}

export interface DatasurfrMapProperty {
  property_name: string
  brand: string | null
  city: string | null
  state: string | null
  region: string | null
  country: string | null
  latitude: number
  longitude: number
}

export interface DatasurfrImportPayload {
  alert_ids?: string[]
  selections?: Array<{
    alert_id: string
    region?: string
  }>
  time?: number
  template_id?: number
}

export interface DatasurfrImportResponse {
  imported: Array<{
    alert_id: string
    notification_id: number
    heading: string | null
    status: string
    region?: string | null
  }>
  skipped: Array<{
    alert_id: string
    reason: string
  }>
}

export interface DatasurfrRegionSummaryImportPayload {
  region: string
  time?: number
  template_id?: number
}

export interface DatasurfrRegionSummaryImportResponse {
  region: string
  notification_id: number
  heading: string | null
  status: string
  event_count: number
  priority_event_count: number
}

export interface DatasurfrEventsSummaryImportResponse {
  notification_id: number
  heading: string | null
  status: string
  selected_event_count: number
  skipped: Array<{
    alert_id: string
    reason: string
  }>
}

