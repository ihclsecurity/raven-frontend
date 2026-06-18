/**
 * Property Mapping Contracts
 *
 * What this file does
 * -------------------
 * This file defines the shared data shapes used by the property mapping editor
 * and the map-related advisory workflows.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the property and mapping shapes first, then the request payloads. That
 * mirrors the way the mapping editor builds and saves selections.
 *
 * When to change this file
 * ------------------------
 * Update this file when the property-mapping backend changes its schema.
 *
 * What this file does not do
 * --------------------------
 * This file does not resolve property matches. It only describes the data.
 */

export type PropertyMappingCellValue = string | number | boolean | null

export interface PropertyMappingRow {
  row_id: number
  values: Record<string, PropertyMappingCellValue>
}

export interface PropertyMappingSummary {
  total: number
  operational: number
  pipeline: number
  future: number
  other: number
}

export interface PropertyMappingListResponse {
  columns: string[]
  rows: PropertyMappingRow[]
  summary: PropertyMappingSummary
  source_file: string
  restart_required: boolean
}

export interface PropertyMappingUpdatePayload {
  values: Record<string, PropertyMappingCellValue>
}

export type PropertyMappingCreatePayload = PropertyMappingUpdatePayload
