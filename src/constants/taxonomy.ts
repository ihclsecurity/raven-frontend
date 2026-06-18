/**
 * Incident Taxonomy Constants
 *
 * This file defines the canonical incident categories and the matching helpers
 * used by the frontend to label alerts consistently.
 *
 * It is responsible for:
 * - listing the canonical incident categories shown in the UI
 * - mapping legacy labels and alert text to those categories
 * - providing color/order metadata for charts and filters
 *
 * What this file does not do:
 * - it does not fetch alerts
 * - it does not decide the backend incident type on its own
 */
import type { DatasurfrAlert } from '../types/datasurfr'

export const INCIDENT_TYPE_OPTIONS = [
  'Terror / Threat',
  'Civil Unrest',
  'Crime & Law',
  'Travel Disruption',
  'Critical Infrastructure',
  'Weather Disruption',
  'Natural Disaster',
  'Public Health',
  'Political & Governance',
  'Other',
] as const

export type AlertCategoryKey =
  | 'all'
  | 'security_threats'
  | 'civil_unrest'
  | 'crime_law'
  | 'travel_disruption'
  | 'critical_infrastructure'
  | 'weather_disruption'
  | 'natural_disaster'
  | 'public_health'
  | 'political_governance'
  | 'other'

export type FilterableAlertCategoryKey = Exclude<AlertCategoryKey, 'all'>

export type AlertCategoryDefinition = {
  key: AlertCategoryKey
  label: string
  color: string
}

export const ALERT_CATEGORY_OPTIONS: AlertCategoryDefinition[] = [
  { key: 'all', label: 'All', color: '#64748b' },
  { key: 'security_threats', label: 'Terror / Threat', color: '#dc2626' },
  { key: 'civil_unrest', label: 'Civil Unrest', color: '#b45309' },
  { key: 'crime_law', label: 'Crime & Law', color: '#7c3aed' },
  { key: 'travel_disruption', label: 'Travel Disruption', color: '#2563eb' },
  { key: 'critical_infrastructure', label: 'Critical Infrastructure', color: '#0f766e' },
  { key: 'weather_disruption', label: 'Weather Disruption', color: '#0369a1' },
  { key: 'natural_disaster', label: 'Natural Disaster', color: '#be123c' },
  { key: 'public_health', label: 'Public Health', color: '#0f766e' },
  { key: 'political_governance', label: 'Political & Governance', color: '#475569' },
  { key: 'other', label: 'Other', color: '#64748b' },
]

export const ALERT_CATEGORY_ORDER: Array<AlertCategoryDefinition & { key: FilterableAlertCategoryKey }> =
  ALERT_CATEGORY_OPTIONS.filter((item) => item.key !== 'all') as Array<
    AlertCategoryDefinition & { key: FilterableAlertCategoryKey }
  >

const INCIDENT_TYPE_TO_CATEGORY_KEY: Record<string, FilterableAlertCategoryKey> = {
  'terror / threat': 'security_threats',
  'civil unrest': 'civil_unrest',
  'crime & law': 'crime_law',
  'travel disruption': 'travel_disruption',
  'critical infrastructure': 'critical_infrastructure',
  'weather disruption': 'weather_disruption',
  'natural disaster': 'natural_disaster',
  'public health': 'public_health',
  'political & governance': 'political_governance',
  other: 'other',
}

const LEGACY_LABEL_HINTS: Array<{ label: string; terms: string[] }> = [
  { label: 'Terror / Threat', terms: ['terror threat', 'security threat', 'security threats', 'extremism', 'bomb threat'] },
  { label: 'Civil Unrest', terms: ['civil unrest protest', 'civil unrest', 'civil disturbances', 'law and order'] },
  { label: 'Crime & Law', terms: ['crime', 'law enforcement'] },
  { label: 'Travel Disruption', terms: ['travel risks', 'travel disruption'] },
  { label: 'Critical Infrastructure', terms: ['critical infrastructure', 'infrastructure failure', 'fire safety incident'] },
  { label: 'Weather Disruption', terms: ['weather disruption', 'environment'] },
  { label: 'Natural Disaster', terms: ['natural disaster', 'natural disasters'] },
  { label: 'Public Health', terms: ['public health', 'health pandemic'] },
  { label: 'Political & Governance', terms: ['political sensitivity', 'vip movement', 'governance'] },
  { label: 'Other', terms: ['other'] },
]

function normalizeText(value: string | null | undefined): string {
  return String(value || '').toLowerCase()
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle))
}

function normalizeIncidentTypeLabel(value: string | null | undefined): string | null {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }
  for (const option of INCIDENT_TYPE_OPTIONS) {
    if (normalizeText(option) === normalized) {
      return option
    }
  }
  for (const entry of LEGACY_LABEL_HINTS) {
    if (includesAny(normalized, entry.terms)) {
      return entry.label
    }
  }
  return null
}

function inferIncidentTypeFromAlertFields(alert: DatasurfrAlert): string | null {
  const risk = normalizeText(alert.risk_category)
  const subRisk = normalizeText(alert.sub_risk_category_name)
  const text = [
    alert.event_title,
    alert.event_description || '',
    alert.event_location || '',
    alert.risk_category || '',
    alert.sub_risk_category_name || '',
  ].join(' ').toLowerCase()
  const riskAndSubRisk = `${risk} ${subRisk}`

  if (
    includesAny(subRisk, [
      'terror threats & attacks',
      'terror threat',
      'terror threats',
      'terror attack',
      'terror attacks',
      'bomb & explosion',
      'bomb and explosion',
      'ied blast',
      'hostage',
      'active shooter',
    ])
  ) {
    return 'Terror / Threat'
  }

  if (
    includesAny(subRisk, [
      'road blocks & congestion',
      'road block & congestion',
      'air transport',
      'rail transport',
      'transport disruption',
    ])
  ) {
    return 'Travel Disruption'
  }

  if (
    includesAny(subRisk, [
      'rainfall',
      'weather forecast',
      'lightning strikes',
      'cold wave',
      'heatwave',
      'heat wave',
      'storm',
      'thunderstorm',
      'squall',
    ])
  ) {
    return 'Weather Disruption'
  }

  if (
    includesAny(subRisk, [
      'landslide',
      'avalanche',
      'earthquake',
      'tsunami',
      'cyclone',
      'flood',
      'wildfire',
    ])
  ) {
    return 'Natural Disaster'
  }

  if (includesAny(subRisk, ['protest', 'riot', 'rally', 'gathering', 'strike', 'bandh', 'curfew'])) {
    return 'Civil Unrest'
  }

  if (includesAny(subRisk, ['law enforcement', 'theft', 'criminal networks'])) {
    return 'Crime & Law'
  }

  if (includesAny(subRisk, ['water supply', 'power', 'electricity', 'fuel', 'lpg', 'internet', 'telecom'])) {
    return 'Critical Infrastructure'
  }

  if (includesAny(subRisk, ['election', 'polling', 'campaign', 'governance'])) {
    return 'Political & Governance'
  }

  if (includesAny(subRisk, ['outbreak', 'epidemic', 'pandemic', 'disease', 'contamination'])) {
    return 'Public Health'
  }

  if (risk.includes('extremism')) return 'Terror / Threat'
  if (risk.includes('natural disasters')) return 'Natural Disaster'
  if (risk.includes('environment')) return 'Weather Disruption'
  if (risk.includes('critical infrastructure')) return 'Critical Infrastructure'
  if (risk.includes('travel risks')) return 'Travel Disruption'
  if (risk.includes('civil disturbances')) return 'Civil Unrest'
  if (risk.includes('crime')) return 'Crime & Law'
  if (risk.includes('health')) return 'Public Health'
  if (risk.includes('political')) return 'Political & Governance'

  if (
    includesAny(text, [
      'landslide',
      'avalanche',
      'earthquake',
      'tsunami',
      'cyclone',
      'wildfire',
      'forest fire',
    ])
  ) return 'Natural Disaster'

  if (
    includesAny(text, [
      'rain',
      'thunderstorm',
      'lightning',
      'weather alert',
      'heatwave',
      'cold wave',
      'squall',
      'hailstorm',
    ])
  ) return 'Weather Disruption'

  if (
    includesAny(text, [
      'power outage',
      'power cut',
      'electricity',
      'water supply',
      'internet outage',
      'telecom outage',
      'fuel shortage',
      'lpg',
    ])
  ) return 'Critical Infrastructure'

  if (
    includesAny(text, [
      'road block',
      'congestion',
      'traffic advisory',
      'airport',
      'flight',
      'rail',
      'metro',
      'transport',
    ])
  ) return 'Travel Disruption'

  if (includesAny(text, ['protest', 'riot', 'rally', 'gathering', 'bandh', 'strike', 'curfew'])) return 'Civil Unrest'

  if (includesAny(text, ['murder', 'assault', 'stabbing', 'theft', 'robbery', 'arson', 'firing', 'gunfire'])) {
    return 'Crime & Law'
  }

  if (includesAny(text, ['outbreak', 'epidemic', 'pandemic', 'disease', 'contamination'])) return 'Public Health'

  if (includesAny(text, ['election', 'polling', 'campaign'])) return 'Political & Governance'

  if (includesAny(riskAndSubRisk, ['terror', 'extremism', 'bomb', 'explosive', 'ied', 'militant', 'hostage'])) {
    return 'Terror / Threat'
  }

  if (includesAny(text, ['threat', 'threatened'])) return 'Terror / Threat'

  return null
}

export function categorizeAlert(alert: DatasurfrAlert): FilterableAlertCategoryKey {
  const incidentTypeLabel = normalizeIncidentTypeLabel(alert.incident_type) || inferIncidentTypeFromAlertFields(alert)
  if (!incidentTypeLabel) {
    return 'other'
  }
  return INCIDENT_TYPE_TO_CATEGORY_KEY[normalizeText(incidentTypeLabel)] || 'other'
}

export function createAlertCategoryCounts(alerts: DatasurfrAlert[]): Record<AlertCategoryKey, number> {
  const counts: Record<AlertCategoryKey, number> = {
    all: alerts.length,
    security_threats: 0,
    civil_unrest: 0,
    crime_law: 0,
    travel_disruption: 0,
    critical_infrastructure: 0,
    weather_disruption: 0,
    natural_disaster: 0,
    public_health: 0,
    political_governance: 0,
    other: 0,
  }
  for (const alert of alerts) {
    counts[categorizeAlert(alert)] += 1
  }
  return counts
}

