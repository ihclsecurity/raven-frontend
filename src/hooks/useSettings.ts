/**
 * Settings Query Hooks
 *
 * What this file does
 * -------------------
 * This file exposes the settings query and a parsed settings helper so screens
 * can work with the backend configuration in a UI-friendly shape.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the raw query first, then the parsed helper. The parsed helper is where
 * the stringified JSON settings become normal arrays and numbers.
 *
 * When to change this file
 * ------------------------
 * Update this file when new settings fields are introduced or when a parsed
 * helper needs to expose another option group.
 *
 * What this file does not do
 * --------------------------
 * This file does not store settings or validate them on the server. It only
 * reads and shapes the response for the UI.
 */

import { useQuery } from '@tanstack/react-query'
import { settingsApi } from '../api/settings'
import { INCIDENT_TYPE_OPTIONS } from '../constants/taxonomy'

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.getAll,
    staleTime: 5 * 60 * 1000,
  })
}

// The parsed helper converts the backend's stringified JSON settings into the
// concrete arrays and numbers that the UI components expect.
export function useParsedSettings() {
  const { data: rawSettings } = useSettings()
  if (!rawSettings) return null

  return {
    severityOptions: JSON.parse(rawSettings.severity_options_json || '[]') as string[],
    confidenceOptions: JSON.parse(rawSettings.confidence_options_json || '[]') as string[],
    businessImpactOptions: JSON.parse(rawSettings.business_impact_options_json || '[]') as string[],
    incidentTypeOptions: [...INCIDENT_TYPE_OPTIONS],
    toneOptions: JSON.parse(rawSettings.tone_options_json || '[]') as string[],
    autoSaveInterval: parseInt(rawSettings.auto_save_interval_seconds || '30', 10) * 1000,
  }
}

