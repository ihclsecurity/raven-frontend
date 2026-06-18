/**
 * Module: MapView
 * Purpose: Plot priority Datasurfr operational alerts on an interactive map.
 * Context: Keep this page focused on map discovery and quick situational drill-down.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import maplibregl, { LngLatBounds } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ChevronRight, Maximize2, Minimize2, Search, X } from 'lucide-react'
import { datasurfrApi } from '../api/datasurfr'
import { FEED_WINDOW_OPTIONS } from '../constants/feedWindows'
import { ALERT_CATEGORY_OPTIONS, categorizeAlert, type FilterableAlertCategoryKey } from '../constants/taxonomy'
import type { DatasurfrAlert, DatasurfrMapProperty } from '../types/datasurfr'
import type { FeedTopBarControls } from '../components/layout/AppShell'
import { addPoliticalMapLabels } from '../utils/politicalMapLabels'
import { useAuth } from '../auth/AuthContext'
import { hasFullAccess } from '../utils/authRoles'
import { formatAppTime } from '../utils/dateTime'
import {
  canonicalPropertyBrand,
  markerColorByBrand,
  PROPERTY_CLUSTER_COLOR,
} from '../utils/propertyBrandMap'

const MAP_STYLE_LIGHT_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const MAP_STYLE_DARK_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

type AlertMapFeatureProperties = {
  id: string
  title: string
  risk: string
  subRisk: string
  categoryKey: FilterableAlertCategoryKey
  markerColor: string
  markerRadius: number
  score: number
  level: string
  latest: string
  location: string
  locationLabel: string
  regions: string
}

type AlertRadiusFeatureProperties = {
  id: string
  radiusKm: number | null
  markerColor: string
  isSelected: number
  scope: string
}

type PropertyMapFeatureProperties = {
  id: string
  propertyName: string
  brand: string
  city: string
  state: string
  region: string
  country: string
  markerColor: string
  isImpacted: number
}

type MapViewGuideStep = {
  key: string
  title: string
  description: string
  points: string[]
  targetId: string
}

const MAP_VIEW_GUIDE_STEPS: MapViewGuideStep[] = [
  {
    key: 'top-nav',
    title: 'Map View Overview',
    description: 'Use Map View to monitor high-impact alerts spatially, validate affected-property context, and drill into priority events quickly.',
    points: [
      'The map shows operational geography and alert concentration.',
      'The side panel keeps a ranked list for fast incident switching.',
    ],
    targetId: 'dashboard-guide-topbar',
  },
  {
    key: 'map-panel',
    title: 'Interactive Map Panel',
    description: 'Pan, zoom, and click markers to inspect alert metadata, impact scope, and popup details.',
    points: [
      'Cluster clicks zoom into denser alert zones.',
      'Single-marker clicks select alerts and update side-panel context.',
    ],
    targetId: 'map-view-guide-map-panel',
  },
  {
    key: 'toolbar-controls',
    title: 'Layer And Scope Controls',
    description: 'Toggle properties, impact radius, and impacted-only mode; then narrow displayed hotels by region.',
    points: [
      'Use impacted-only mode when auditing a selected incident footprint.',
      'Region filter helps isolate property exposure by geography.',
    ],
    targetId: 'map-view-guide-toolbar-controls',
  },
  {
    key: 'legends',
    title: 'Legends And Brand Signals',
    description: 'Read category and property-brand legends to interpret marker meaning and click brands to filter map properties.',
    points: [
      'Category legend indicates incident type distribution.',
      'Brand legend supports brand-specific impact reviews.',
    ],
    targetId: 'map-view-guide-legends',
  },
  {
    key: 'selected-card',
    title: 'Selected Alert Snapshot',
    description: 'Review the focused alert summary with score, recency, risk, and location to decide if escalation is needed.',
    points: [
      'This panel reflects whichever marker/list item is active.',
      'Use it before importing to Compose for advisory drafting.',
    ],
    targetId: 'map-view-guide-selected-card',
  },
  {
    key: 'priority-list',
    title: 'Priority Alert List',
    description: 'Use the ranked list to jump between high-impact incidents and keep map focus synchronized.',
    points: [
      'List entries are sorted by impact and freshness.',
      'Open Datasurfr Feed for broader alert exploration when needed.',
    ],
    targetId: 'map-view-guide-priority-list',
  },
]

type GenericGeoJsonFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: any
    properties?: Record<string, any>
  }>
}

const EARTH_RADIUS_KM = 6371
const IMPACT_RADIUS_FALLBACK_KM = 45

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function containsPhrase(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false
  return ` ${haystack} `.includes(` ${needle} `)
}

function impactRadiusKmForAlert(alert: DatasurfrAlert): number {
  const value = Number(alert.impact_radius_km)
  if (Number.isFinite(value) && value > 0) {
    return Math.round(value)
  }
  return IMPACT_RADIUS_FALLBACK_KM
}

function normalizedImpactScope(alert: DatasurfrAlert): 'Local' | 'State' | 'National' {
  const scope = String(alert.impact_scope || '').trim().toLowerCase()
  if (scope === 'national') return 'National'
  if (scope === 'state') return 'State'
  return 'Local'
}

function destinationPoint(lon: number, lat: number, bearingRadians: number, distanceKm: number): [number, number] {
  const latRad = (lat * Math.PI) / 180
  const lonRad = (lon * Math.PI) / 180
  const angularDistance = distanceKm / EARTH_RADIUS_KM
  const sinLat = Math.sin(latRad)
  const cosLat = Math.cos(latRad)
  const sinAngular = Math.sin(angularDistance)
  const cosAngular = Math.cos(angularDistance)
  const sinLat2 = sinLat * cosAngular + cosLat * sinAngular * Math.cos(bearingRadians)
  const lat2 = Math.asin(Math.max(-1, Math.min(1, sinLat2)))
  const y = Math.sin(bearingRadians) * sinAngular * cosLat
  const x = cosAngular - sinLat * Math.sin(lat2)
  const lon2 = lonRad + Math.atan2(y, x)
  const normalizedLon = ((lon2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  return [(normalizedLon * 180) / Math.PI, (lat2 * 180) / Math.PI]
}

function createCirclePolygon(lon: number, lat: number, radiusKm: number, segments = 64): [number, number][] {
  const ring: [number, number][] = []
  for (let i = 0; i <= segments; i += 1) {
    const bearing = (i / segments) * Math.PI * 2
    ring.push(destinationPoint(lon, lat, bearing, radiusKm))
  }
  return ring
}

function normalizeStateBoundaryName(value: string | null | undefined): string {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  if (normalized === 'andaman and nicobar islands') return 'andaman and nicobar'
  if (normalized === 'dadra and nagar haveli and daman and diu') return 'daman and diu'
  if (normalized === 'jammu and kashmir') return 'jammu and kashmir'
  if (normalized === 'delhi') return 'delhi'
  return normalized
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const raw of values) {
    const item = String(raw || '').trim()
    if (!item) continue
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(item)
  }
  return output
}

function hasCoordinates(alert: DatasurfrAlert): alert is DatasurfrAlert & { latitude: number; longitude: number } {
  if (typeof alert.latitude !== 'number' || typeof alert.longitude !== 'number') {
    return false
  }
  return Math.abs(alert.latitude) <= 90 && Math.abs(alert.longitude) <= 180
}

function hasPropertyCoordinates(property: DatasurfrMapProperty): property is DatasurfrMapProperty & {
  latitude: number
  longitude: number
} {
  if (typeof property.latitude !== 'number' || typeof property.longitude !== 'number') {
    return false
  }
  return Math.abs(property.latitude) <= 90 && Math.abs(property.longitude) <= 180
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function markerColorByCategory(categoryKey: FilterableAlertCategoryKey): string {
  const found = ALERT_CATEGORY_OPTIONS.find((option) => option.key === categoryKey)
  return found?.color || '#64748b'
}

function markerRadiusByScore(score: number): number {
  if (score >= 70) return 12
  if (score >= 55) return 10
  return 9
}

function extractLocationLabel(value: string | null): string {
  const text = String(value || '').trim()
  if (!text) return 'Unknown'
  const parts = text.split(',').map((part) => part.trim()).filter(Boolean)
  if (!parts.length) return text
  if (parts.length === 1) return parts[0]
  return `${parts[0]}, ${parts[1]}`
}

function propertyKeyFromName(value: string | null): string {
  return String(value || '').trim().toLowerCase()
}

export default function MapViewPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canUseActions = hasFullAccess(user)
  const {
    setFeedTopBarControls,
    sharedFeedTimeWindow,
    setSharedFeedTimeWindow,
    feedRefreshNonce,
    triggerFeedRefresh,
    mapViewGuideLaunchNonce,
  } = useOutletContext<{
    setFeedTopBarControls: (controls: FeedTopBarControls | null) => void
    sharedFeedTimeWindow: number
    setSharedFeedTimeWindow: (value: number) => void
    feedRefreshNonce: number
    triggerFeedRefresh: () => void
    mapViewGuideLaunchNonce: number
  }>()
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapPanelRef = useRef<HTMLElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [isMapReady, setIsMapReady] = useState(false)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const propertyPopupRef = useRef<maplibregl.Popup | null>(null)
  const propertySearchInputRef = useRef<HTMLInputElement | null>(null)
  const fitPendingRef = useRef(true)
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null)
  const [showImpactRadii, setShowImpactRadii] = useState<boolean>(true)
  const [showProperties, setShowProperties] = useState<boolean>(true)
  const [showOnlyImpactedProperties, setShowOnlyImpactedProperties] = useState<boolean>(false)
  const [selectedPropertyRegion, setSelectedPropertyRegion] = useState<string>('all')
  const [selectedPropertyBrand, setSelectedPropertyBrand] = useState<string>('all')
  const [isPropertySearchOpen, setIsPropertySearchOpen] = useState<boolean>(false)
  const [propertySearch, setPropertySearch] = useState<string>('')
  const [selectedAlertCategory, setSelectedAlertCategory] = useState<FilterableAlertCategoryKey | 'all'>('all')
  const [importingAlertId, setImportingAlertId] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [isMapFullscreen, setIsMapFullscreen] = useState<boolean>(false)
  const guideDoneTimeoutRef = useRef<number | null>(null)
  const [isGuideActive, setIsGuideActive] = useState(false)
  const [guideStepIndex, setGuideStepIndex] = useState(0)
  const [guidePopoverPosition, setGuidePopoverPosition] = useState({ top: 84, left: 20 })
  const [showGuideDoneMessage, setShowGuideDoneMessage] = useState(false)
  const activeGuideStep = isGuideActive ? MAP_VIEW_GUIDE_STEPS[guideStepIndex] : null
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    if (typeof document === 'undefined') return 'light'
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  })
  const [indiaCountryBoundary, setIndiaCountryBoundary] = useState<GenericGeoJsonFeatureCollection | null>(null)
  const [indiaStateBoundaries, setIndiaStateBoundaries] = useState<GenericGeoJsonFeatureCollection | null>(null)
  const isDarkTheme = themeMode === 'dark'
  const mapStyleUrl = isDarkTheme ? MAP_STYLE_DARK_URL : MAP_STYLE_LIGHT_URL

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const root = document.documentElement
    const readTheme = () => (root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light')
    setThemeMode((current) => {
      const next = readTheme()
      return current === next ? current : next
    })

    const observer = new MutationObserver(() => {
      const next = readTheme()
      setThemeMode((current) => (current === next ? current : next))
    })
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadBoundaries = async () => {
      try {
        const [countryResponse, stateResponse] = await Promise.all([
          fetch('/geo/india-country.geojson'),
          fetch('/geo/india-states.geojson'),
        ])
        if (cancelled) return
        const [countryJson, statesJson] = await Promise.all([countryResponse.json(), stateResponse.json()])
        if (cancelled) return
        if (countryJson?.type === 'FeatureCollection' && Array.isArray(countryJson.features)) {
          setIndiaCountryBoundary(countryJson as GenericGeoJsonFeatureCollection)
        }
        if (statesJson?.type === 'FeatureCollection' && Array.isArray(statesJson.features)) {
          setIndiaStateBoundaries(statesJson as GenericGeoJsonFeatureCollection)
        }
      } catch {
        if (!cancelled) {
          setIndiaCountryBoundary(null)
          setIndiaStateBoundaries(null)
        }
      }
    }
    void loadBoundaries()
    return () => {
      cancelled = true
    }
  }, [])

  const alertsQuery = useQuery({
    queryKey: ['datasurfr-alerts', sharedFeedTimeWindow, feedRefreshNonce],
    queryFn: () => datasurfrApi.listAlerts(sharedFeedTimeWindow),
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
    staleTime: 60000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
  const propertiesQuery = useQuery({
    queryKey: ['map-view-properties', feedRefreshNonce],
    queryFn: () => datasurfrApi.listMapProperties(),
    staleTime: 300000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

  const allAlerts = alertsQuery.data || []
  const priorityAlerts = useMemo(
    () => allAlerts.filter((alert) => alert.hotel_impact_level === 'high'),
    [allAlerts],
  )
  const filteredPriorityAlerts = useMemo(() => {
    if (selectedAlertCategory === 'all') return priorityAlerts
    return priorityAlerts.filter((alert) => categorizeAlert(alert) === selectedAlertCategory)
  }, [priorityAlerts, selectedAlertCategory])
  const mappablePriorityAlerts = useMemo(
    () => filteredPriorityAlerts.filter(hasCoordinates),
    [filteredPriorityAlerts],
  )
  const sortedPriorityAlerts = useMemo(
    () =>
      [...filteredPriorityAlerts].sort((a, b) => {
        if (b.hotel_impact_score !== a.hotel_impact_score) return b.hotel_impact_score - a.hotel_impact_score
        const aAge = a.latest_update_age_minutes ?? Number.MAX_SAFE_INTEGER
        const bAge = b.latest_update_age_minutes ?? Number.MAX_SAFE_INTEGER
        return aAge - bAge
      }),
    [filteredPriorityAlerts],
  )

  const selectedAlert = useMemo(
    () => sortedPriorityAlerts.find((alert) => alert.id === selectedAlertId) || null,
    [sortedPriorityAlerts, selectedAlertId],
  )

  const selectedAlertRadiusKm = useMemo(
    () => (selectedAlert ? impactRadiusKmForAlert(selectedAlert) : null),
    [selectedAlert],
  )

  const categoryCount = useMemo(() => {
    const output: Record<FilterableAlertCategoryKey, number> = {
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
    for (const alert of priorityAlerts) {
      output[categorizeAlert(alert)] += 1
    }
    return output
  }, [priorityAlerts])

  const allProperties = useMemo(
    () => (propertiesQuery.data || []).filter(hasPropertyCoordinates),
    [propertiesQuery.data],
  )
  const propertyRegionOptions = useMemo(
    () =>
      uniqueStrings(
        allProperties.map((property) => {
          const region = String(property.region || '').trim()
          return region || 'Unknown'
        }),
      ).sort((a, b) => a.localeCompare(b)),
    [allProperties],
  )
  const impactedPropertyKeys = useMemo(() => {
    if (!selectedAlert) return new Set<string>()
    return new Set((selectedAlert.impacted_properties_all || []).map((name) => propertyKeyFromName(name)))
  }, [selectedAlert])
  const scopedProperties = useMemo(() => {
    if (!showProperties) return []
    if (!showOnlyImpactedProperties) return allProperties
    if (!impactedPropertyKeys.size) return []
    return allProperties.filter((item) => impactedPropertyKeys.has(propertyKeyFromName(item.property_name)))
  }, [allProperties, impactedPropertyKeys, showOnlyImpactedProperties, showProperties])
  const regionScopedProperties = useMemo(() => {
    if (selectedPropertyRegion === 'all') return scopedProperties
    return scopedProperties.filter((property) => {
      const region = String(property.region || '').trim() || 'Unknown'
      return region === selectedPropertyRegion
    })
  }, [scopedProperties, selectedPropertyRegion])
  const visibleProperties = useMemo(() => {
    if (selectedPropertyBrand === 'all') return regionScopedProperties
    return regionScopedProperties.filter((property) => canonicalPropertyBrand(property) === selectedPropertyBrand)
  }, [regionScopedProperties, selectedPropertyBrand])
  const propertySearchResults = useMemo(() => {
    const query = normalizeText(propertySearch)
    if (!query) return []
    return allProperties
      .filter((property) => {
        const haystack = normalizeText(
          [
            property.property_name,
            property.brand,
            property.city,
            property.state,
            property.region,
            property.country,
          ]
            .filter(Boolean)
            .join(' '),
        )
        return containsPhrase(haystack, query) || haystack.includes(query)
      })
      .sort((a, b) => {
        const aName = normalizeText(a.property_name)
        const bName = normalizeText(b.property_name)
        const aStarts = aName.startsWith(query) ? 0 : 1
        const bStarts = bName.startsWith(query) ? 0 : 1
        if (aStarts !== bStarts) return aStarts - bStarts
        return a.property_name.localeCompare(b.property_name)
      })
      .slice(0, 8)
  }, [allProperties, propertySearch])
  const propertyBrandCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const property of regionScopedProperties) {
      const brand = canonicalPropertyBrand(property)
      counts[brand] = (counts[brand] || 0) + 1
    }
    return counts
  }, [regionScopedProperties])
  const importAlertMutation = useMutation({
    mutationFn: (alertId: string) => datasurfrApi.importAlerts({ alert_ids: [alertId], time: sharedFeedTimeWindow }),
    onMutate: (alertId) => {
      setImportError(null)
      setImportingAlertId(alertId)
    },
    onSuccess: (result, alertId) => {
      const imported = result.imported?.[0]
      if (imported?.notification_id) {
        navigate(`/compose?id=${imported.notification_id}`)
        return
      }
      const skippedReason =
        result.skipped?.find((entry) => entry.alert_id === alertId)?.reason || result.skipped?.[0]?.reason || 'Import skipped.'
      setImportError(skippedReason)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to import event.'
      setImportError(message)
    },
    onSettled: () => {
      setImportingAlertId(null)
    },
  })
  const isImportPending = importAlertMutation.isPending
  const importAlertFromMap = importAlertMutation.mutateAsync

  const geojsonData = useMemo(() => {
    return {
      type: 'FeatureCollection' as const,
      features: mappablePriorityAlerts.map((alert) => {
        const categoryKey = categorizeAlert(alert)
        const properties: AlertMapFeatureProperties = {
          id: alert.id,
          title: alert.event_title || 'Untitled event',
          risk: alert.risk_category || 'Uncategorized',
          subRisk: alert.sub_risk_category_name || 'Other',
          categoryKey,
          markerColor: markerColorByCategory(categoryKey),
          markerRadius: markerRadiusByScore(alert.hotel_impact_score || 0),
          score: alert.hotel_impact_score || 0,
          level: alert.hotel_impact_level || 'low',
          latest: alert.latest_update_local || alert.latest_update || 'Not Available',
          location: alert.event_location || 'Location not available',
          locationLabel: extractLocationLabel(alert.event_location),
          regions: uniqueStrings(alert.mapped_regions || []).join(', ') || 'Not mapped',
        }
        return {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [alert.longitude, alert.latitude] as [number, number],
          },
          properties,
        }
      }),
    }
  }, [mappablePriorityAlerts])

  const propertyGeojsonData = useMemo(() => {
    return {
      type: 'FeatureCollection' as const,
      features: visibleProperties.map((property) => {
        const key = propertyKeyFromName(property.property_name)
        const isImpacted = impactedPropertyKeys.has(key) ? 1 : 0
        const brand = canonicalPropertyBrand(property)
        const region = String(property.region || '').trim() || 'Unknown'
        const properties: PropertyMapFeatureProperties = {
          id: `${key}-${property.latitude}-${property.longitude}`,
          propertyName: property.property_name,
          brand,
          city: property.city || '-',
          state: property.state || '-',
          region,
          country: property.country || '-',
          markerColor: markerColorByBrand(brand),
          isImpacted,
        }
        return {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [property.longitude, property.latitude] as [number, number],
          },
          properties,
        }
      }),
    }
  }, [impactedPropertyKeys, visibleProperties])

  const radiusGeojsonData = useMemo(() => {
    if (!showImpactRadii) {
      return { type: 'FeatureCollection' as const, features: [] as const }
    }
    const impactOverlayAlerts = selectedAlertId
      ? mappablePriorityAlerts.filter((alert) => alert.id === selectedAlertId)
      : mappablePriorityAlerts
    return {
      type: 'FeatureCollection' as const,
      features: impactOverlayAlerts.flatMap((alert) => {
        const categoryKey = categorizeAlert(alert)
        const scope = normalizedImpactScope(alert)
        const markerColor = markerColorByCategory(categoryKey)
        const isSelected = selectedAlertId === alert.id ? 1 : 0

        if (scope === 'Local') {
          const radiusKm = impactRadiusKmForAlert(alert)
          const properties: AlertRadiusFeatureProperties = {
            id: alert.id,
            radiusKm,
            markerColor,
            isSelected,
            scope,
          }
          return [
            {
              type: 'Feature' as const,
              geometry: {
                type: 'Polygon' as const,
                coordinates: [createCirclePolygon(alert.longitude, alert.latitude, radiusKm)],
              },
              properties,
            },
          ]
        }

        if (scope === 'National') {
          const scopedCountries = new Set((alert.impact_scope_countries || ['India']).map((item) => normalizeText(item)))
          const nationalFeatures = indiaStateBoundaries?.features?.length
            ? indiaStateBoundaries.features
            : indiaCountryBoundary?.features || []
          if (!scopedCountries.has('india') || !nationalFeatures.length) return []
          return nationalFeatures.map((feature, index) => ({
            type: 'Feature' as const,
            geometry: feature.geometry,
            properties: {
              id: `${alert.id}-national-${index}`,
              radiusKm: null,
              markerColor,
              isSelected,
              scope,
            } as AlertRadiusFeatureProperties,
          }))
        }

        if (scope === 'State') {
          if (!indiaStateBoundaries?.features?.length || !alert.impact_scope_states?.length) return []
          const scopedStates = new Set(alert.impact_scope_states.map((item) => normalizeStateBoundaryName(item)))
          return indiaStateBoundaries.features
            .filter((feature) => scopedStates.has(normalizeStateBoundaryName(String(feature?.properties?.NAME_1 || ''))))
            .map((feature, index) => ({
              type: 'Feature' as const,
              geometry: feature.geometry,
              properties: {
                id: `${alert.id}-state-${index}`,
                radiusKm: null,
                markerColor,
                isSelected,
                scope,
              } as AlertRadiusFeatureProperties,
            }))
        }

        return []
      }),
    }
  }, [indiaCountryBoundary, indiaStateBoundaries, mappablePriorityAlerts, selectedAlertId, showImpactRadii])

  useEffect(() => {
    fitPendingRef.current = true
  }, [sharedFeedTimeWindow])

  useEffect(() => {
    if (showProperties) return
    propertyPopupRef.current?.remove()
    propertyPopupRef.current = null
  }, [showProperties])

  useEffect(() => {
    if (!isPropertySearchOpen) return
    propertySearchInputRef.current?.focus()
    propertySearchInputRef.current?.select()
  }, [isPropertySearchOpen])

  useEffect(() => {
    if (selectedPropertyRegion === 'all') return
    if (propertyRegionOptions.includes(selectedPropertyRegion)) return
    setSelectedPropertyRegion('all')
  }, [propertyRegionOptions, selectedPropertyRegion])

  useEffect(() => {
    if (selectedPropertyBrand === 'all') return
    if ((propertyBrandCounts[selectedPropertyBrand] || 0) > 0) return
    setSelectedPropertyBrand('all')
  }, [propertyBrandCounts, selectedPropertyBrand])

  useEffect(() => {
    if (selectedAlertCategory === 'all') return
    if ((categoryCount[selectedAlertCategory] || 0) > 0) return
    setSelectedAlertCategory('all')
  }, [categoryCount, selectedAlertCategory])

  useEffect(() => {
    if (selectedAlert || !showOnlyImpactedProperties) return
    setShowOnlyImpactedProperties(false)
  }, [selectedAlert, showOnlyImpactedProperties])

  useEffect(() => {
    if (!mapContainerRef.current) return

    fitPendingRef.current = true
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyleUrl,
      center: [78.9629, 22.5937],
      zoom: 4.4,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left')
    mapRef.current = map
    setIsMapReady(false)

    map.on('load', () => {
      map.addSource('mapped-properties', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 11,
        clusterRadius: 36,
      })

      map.addLayer({
        id: 'mapped-property-clusters',
        type: 'circle',
        source: 'mapped-properties',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': PROPERTY_CLUSTER_COLOR,
          'circle-radius': ['step', ['get', 'point_count'], 13, 10, 17, 30, 22],
          'circle-opacity': 0.82,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.2,
        },
      })

      map.addLayer({
        id: 'mapped-property-cluster-count',
        type: 'symbol',
        source: 'mapped-properties',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Open Sans Bold'],
          'text-size': 11,
        },
        paint: {
          'text-color': isDarkTheme ? '#dbeafe' : '#1e3a8a',
        },
      })

      map.addLayer({
        id: 'mapped-property-unclustered',
        type: 'circle',
        source: 'mapped-properties',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', 'markerColor'],
          'circle-radius': ['case', ['==', ['get', 'isImpacted'], 1], 5.8, 4.2],
          'circle-opacity': ['case', ['==', ['get', 'isImpacted'], 1], 0.96, 0.82],
          'circle-stroke-color': ['case', ['==', ['get', 'isImpacted'], 1], '#dc2626', '#ffffff'],
          'circle-stroke-width': ['case', ['==', ['get', 'isImpacted'], 1], 1.3, 1],
        },
      })

      map.addLayer({
        id: 'mapped-property-labels',
        type: 'symbol',
        source: 'mapped-properties',
        filter: ['!', ['has', 'point_count']],
        minzoom: 7,
        layout: {
          'text-field': ['get', 'propertyName'],
          'text-font': ['Open Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 7, 10, 12, 12],
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-max-width': 10,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': isDarkTheme ? '#e2e8f0' : '#1e293b',
          'text-halo-color': isDarkTheme ? '#020617' : '#ffffff',
          'text-halo-width': 1.2,
        },
      })

      map.addSource('priority-impact-radii', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      map.addLayer({
        id: 'priority-impact-radius-fill',
        type: 'fill',
        source: 'priority-impact-radii',
        paint: {
          'fill-color': ['coalesce', ['get', 'markerColor'], '#2563eb'],
          'fill-opacity': ['case', ['==', ['get', 'isSelected'], 1], 0.2, 0.1],
        },
      })

      map.addLayer({
        id: 'priority-impact-radius-outline',
        type: 'line',
        source: 'priority-impact-radii',
        paint: {
          'line-color': ['coalesce', ['get', 'markerColor'], '#2563eb'],
          'line-width': ['case', ['==', ['get', 'isSelected'], 1], 2.2, 1.2],
          'line-opacity': ['case', ['==', ['get', 'isSelected'], 1], 0.75, 0.45],
        },
      })

      map.addSource('priority-alerts', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 44,
      })

      map.addLayer({
        id: 'priority-alert-clusters',
        type: 'circle',
        source: 'priority-alerts',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#2563eb', 5, '#f59e0b', 12, '#dc2626'],
          'circle-radius': ['step', ['get', 'point_count'], 18, 5, 22, 12, 28],
          'circle-opacity': 0.85,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      })

      map.addLayer({
        id: 'priority-alert-cluster-count',
        type: 'symbol',
        source: 'priority-alerts',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Open Sans Bold'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#ffffff',
        },
      })

      map.addLayer({
        id: 'priority-alert-unclustered',
        type: 'circle',
        source: 'priority-alerts',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', 'markerColor'],
          'circle-radius': ['get', 'markerRadius'],
          'circle-opacity': 0.9,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      })

      map.addLayer({
        id: 'priority-alert-labels',
        type: 'symbol',
        source: 'priority-alerts',
        filter: ['!', ['has', 'point_count']],
        minzoom: 6,
        layout: {
          'text-field': ['get', 'locationLabel'],
          'text-font': ['Open Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10, 10, 12, 13, 13],
          'text-offset': [0, 1.3],
          'text-anchor': 'top',
          'text-max-width': 12,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': isDarkTheme ? '#e2e8f0' : '#0f172a',
          'text-halo-color': isDarkTheme ? '#020617' : '#ffffff',
          'text-halo-width': 1.3,
          'text-halo-blur': 0.5,
        },
      })

      addPoliticalMapLabels(map, { dark: isDarkTheme })

      map.on('click', 'priority-alert-clusters', (event) => {
        const features = map.queryRenderedFeatures(event.point, { layers: ['priority-alert-clusters'] })
        const clusterFeature = features[0]
        if (!clusterFeature) return
        const clusterId = Number(clusterFeature.properties?.cluster_id)
        const source = map.getSource('priority-alerts') as maplibregl.GeoJSONSource | undefined
        if (!source || !Number.isFinite(clusterId)) return
        void source
          .getClusterExpansionZoom(clusterId)
          .then((zoomLevel) => {
            const geometry = clusterFeature.geometry
            if (!geometry || geometry.type !== 'Point') return
            map.easeTo({
              center: geometry.coordinates as [number, number],
              zoom: zoomLevel ?? map.getZoom() + 1,
              duration: 500,
            })
          })
          .catch(() => undefined)
      })

      map.on('click', 'mapped-property-clusters', (event) => {
        const features = map.queryRenderedFeatures(event.point, { layers: ['mapped-property-clusters'] })
        const clusterFeature = features[0]
        if (!clusterFeature) return
        const clusterId = Number(clusterFeature.properties?.cluster_id)
        const source = map.getSource('mapped-properties') as maplibregl.GeoJSONSource | undefined
        if (!source || !Number.isFinite(clusterId)) return
        void source
          .getClusterExpansionZoom(clusterId)
          .then((zoomLevel) => {
            const geometry = clusterFeature.geometry
            if (!geometry || geometry.type !== 'Point') return
            map.easeTo({
              center: geometry.coordinates as [number, number],
              zoom: zoomLevel ?? map.getZoom() + 1,
              duration: 420,
            })
          })
          .catch(() => undefined)
      })

      map.on('click', 'priority-alert-unclustered', (event) => {
        const feature = event.features?.[0]
        if (!feature) return
        const featureId = String(feature.properties?.id || '').trim()
        if (!featureId) return
        setSelectedAlertId((previous) => (previous === featureId ? null : featureId))
      })

      map.on('click', 'mapped-property-unclustered', (event) => {
        const feature = event.features?.[0]
        if (!feature) return
        const properties = feature.properties as PropertyMapFeatureProperties | undefined
        if (!properties) return
        const geometry = feature.geometry
        if (!geometry || geometry.type !== 'Point') return

        propertyPopupRef.current?.remove()
        const popupHtml = `
          <div class="map-view-popup">
            <div class="map-view-popup-title">${escapeHtml(properties.propertyName || 'Property')}</div>
            <div class="map-view-popup-meta">${escapeHtml(properties.brand || 'Others')} | ${escapeHtml(properties.country || '-')}</div>
            <div class="map-view-popup-meta">${escapeHtml(properties.city || '-')} | ${escapeHtml(properties.state || '-')}</div>
            <div class="map-view-popup-meta">${escapeHtml(properties.region || '-')}</div>
          </div>
        `
        propertyPopupRef.current = new maplibregl.Popup({ offset: 10, closeButton: false })
          .setLngLat(geometry.coordinates as [number, number])
          .setHTML(popupHtml)
          .addTo(map)
      })

      map.on('click', (event) => {
        const features = map.queryRenderedFeatures(event.point, {
          layers: [
            'priority-alert-clusters',
            'priority-alert-unclustered',
            'mapped-property-clusters',
            'mapped-property-unclustered',
          ],
        })
        if (!features.length) {
          setSelectedAlertId(null)
          propertyPopupRef.current?.remove()
          propertyPopupRef.current = null
        }
      })

      map.on('mouseenter', 'mapped-property-clusters', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'mapped-property-clusters', () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('mouseenter', 'mapped-property-unclustered', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'mapped-property-unclustered', () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('mouseenter', 'priority-alert-clusters', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'priority-alert-clusters', () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('mouseenter', 'priority-alert-unclustered', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'priority-alert-unclustered', () => {
        map.getCanvas().style.cursor = ''
      })
      setIsMapReady(true)
    })

    return () => {
      popupRef.current?.remove()
      propertyPopupRef.current?.remove()
      popupRef.current = null
      propertyPopupRef.current = null
      map.remove()
      mapRef.current = null
      setIsMapReady(false)
    }
  }, [isDarkTheme, mapStyleUrl])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isMapReady) return
    const propertySource = map.getSource('mapped-properties') as maplibregl.GeoJSONSource | undefined
    if (propertySource) {
      propertySource.setData(propertyGeojsonData as any)
    }
    const radiusSource = map.getSource('priority-impact-radii') as maplibregl.GeoJSONSource | undefined
    if (radiusSource) {
      radiusSource.setData(radiusGeojsonData as any)
    }
    const source = map.getSource('priority-alerts') as maplibregl.GeoJSONSource | undefined
    if (!source) return
    source.setData(geojsonData as any)

    if (!fitPendingRef.current) return
    const pointsForBounds =
      geojsonData.features.length > 0
        ? geojsonData.features
        : propertyGeojsonData.features
    if (!pointsForBounds.length) return
    const bounds = new LngLatBounds()
    for (const feature of pointsForBounds) {
      bounds.extend(feature.geometry.coordinates as [number, number])
    }
    map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 600 })
    fitPendingRef.current = false
  }, [geojsonData, isMapReady, propertyGeojsonData, radiusGeojsonData])

  useEffect(() => {
    const handleFullscreenChange = () => {
      const panel = mapPanelRef.current
      const fullscreenActive = Boolean(panel && document.fullscreenElement === panel)
      setIsMapFullscreen(fullscreenActive)
      mapRef.current?.resize()
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    popupRef.current?.remove()
    popupRef.current = null
    propertyPopupRef.current?.remove()
    propertyPopupRef.current = null
    if (!map || !selectedAlert || !hasCoordinates(selectedAlert)) return

    const popupContent = document.createElement('div')
    popupContent.className = 'map-view-popup'

    const titleNode = document.createElement('div')
    titleNode.className = 'map-view-popup-title'
    titleNode.textContent = selectedAlert.event_title || 'Untitled event'
    popupContent.appendChild(titleNode)

    const scoreNode = document.createElement('div')
    scoreNode.className = 'map-view-popup-meta'
    scoreNode.textContent = `Score ${selectedAlert.hotel_impact_score} | ${selectedAlert.hotel_impact_level || 'low'}`
    popupContent.appendChild(scoreNode)

    const riskNode = document.createElement('div')
    riskNode.className = 'map-view-popup-meta'
    riskNode.textContent = selectedAlert.risk_category || 'Uncategorized'
    popupContent.appendChild(riskNode)

    const scopeNode = document.createElement('div')
    scopeNode.className = 'map-view-popup-meta'
    const scope = normalizedImpactScope(selectedAlert)
    if (scope === 'Local') {
      scopeNode.textContent = `Impact radius: ${selectedAlertRadiusKm ?? IMPACT_RADIUS_FALLBACK_KM} km`
    } else {
      scopeNode.textContent = `Impact scope: ${scope}`
    }
    popupContent.appendChild(scopeNode)

    if (canUseActions) {
    const importButton = document.createElement('button')
    importButton.type = 'button'
    importButton.className = 'map-view-popup-import-btn map-view-popup-import-btn--icon'
    importButton.disabled = isImportPending
    importButton.title = 'Import to generate advisory'
    importButton.setAttribute('aria-label', 'Import to generate advisory')
    importButton.innerHTML = `<span class="map-view-popup-import-icon">${importingAlertId === selectedAlert.id ? '…' : '+'}</span>`
    importButton.addEventListener('click', () => {
      void importAlertFromMap(selectedAlert.id)
    })
    popupContent.appendChild(importButton)
    }

    popupRef.current = new maplibregl.Popup({ offset: 12, closeButton: false })
      .setLngLat([selectedAlert.longitude, selectedAlert.latitude])
      .setDOMContent(popupContent)
      .addTo(map)

    map.easeTo({
      center: [selectedAlert.longitude, selectedAlert.latitude],
      zoom: Math.max(map.getZoom(), 7),
      duration: 400,
    })
  }, [canUseActions, importAlertFromMap, importingAlertId, isImportPending, selectedAlert, selectedAlertRadiusKm])

  const nowLabel = formatAppTime(Math.max(alertsQuery.dataUpdatedAt || 0, propertiesQuery.dataUpdatedAt || 0, Date.now()))
  const isLoading = alertsQuery.isLoading || propertiesQuery.isLoading

  const handleRefresh = useCallback(() => {
    triggerFeedRefresh()
  }, [triggerFeedRefresh])

  useEffect(() => {
    setFeedTopBarControls({
      timeWindow: sharedFeedTimeWindow,
      windowOptions: [...FEED_WINDOW_OPTIONS],
      onTimeWindowChange: setSharedFeedTimeWindow,
      onRefresh: handleRefresh,
      liveLabel: nowLabel,
      refreshLabel: 'Refresh map',
    })
    return () => setFeedTopBarControls(null)
  }, [
    handleRefresh,
    nowLabel,
    setFeedTopBarControls,
    setSharedFeedTimeWindow,
    sharedFeedTimeWindow,
  ])

  const toggleMapFullscreen = async () => {
    const panel = mapPanelRef.current
    if (!panel) return
    if (document.fullscreenElement === panel) {
      await document.exitFullscreen().catch(() => undefined)
      return
    }
    await panel.requestFullscreen().catch(() => undefined)
  }

  const finishGuide = useCallback(() => {
    setIsGuideActive(false)
    setGuideStepIndex(0)
    setShowGuideDoneMessage(true)
    if (guideDoneTimeoutRef.current) window.clearTimeout(guideDoneTimeoutRef.current)
    guideDoneTimeoutRef.current = window.setTimeout(() => setShowGuideDoneMessage(false), 2200)
  }, [])

  useEffect(() => () => {
    if (guideDoneTimeoutRef.current) window.clearTimeout(guideDoneTimeoutRef.current)
  }, [])

  useEffect(() => {
    if (!mapViewGuideLaunchNonce) return
    setShowGuideDoneMessage(false)
    setGuideStepIndex(0)
    setIsGuideActive(true)
  }, [mapViewGuideLaunchNonce])

  useEffect(() => {
    if (!activeGuideStep) return
    const targetElement = document.getElementById(activeGuideStep.targetId)
    if (!targetElement) return
    const positionPopover = () => {
      const targetRect = targetElement.getBoundingClientRect()
      const popoverWidth = 350
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const margin = 16
      const topbar = document.querySelector('.app-topbar')
      const topbarBottom = topbar ? topbar.getBoundingClientRect().bottom : 0
      let left = targetRect.left
      if (left + popoverWidth > viewportWidth - margin) left = viewportWidth - popoverWidth - margin
      if (left < margin) left = margin
      let top = targetRect.bottom + 12
      if (top + 280 > viewportHeight - margin) top = targetRect.top - 300
      const minTop = Math.max(topbarBottom + 10, margin)
      if (top < minTop) top = minTop
      setGuidePopoverPosition({ top, left })
    }
    positionPopover()
    window.addEventListener('resize', positionPopover)
    window.addEventListener('scroll', positionPopover, true)
    return () => {
      window.removeEventListener('resize', positionPopover)
      window.removeEventListener('scroll', positionPopover, true)
    }
  }, [activeGuideStep])

  useEffect(() => {
    const topbar = document.getElementById('dashboard-guide-topbar')
    if (!topbar) return
    const shouldHighlight = isGuideActive && activeGuideStep?.key === 'top-nav'
    topbar.classList.toggle('dashboard-guide-topbar-active', shouldHighlight)
    return () => topbar.classList.remove('dashboard-guide-topbar-active')
  }, [activeGuideStep?.key, isGuideActive])

  useEffect(() => {
    if (!isGuideActive) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setGuideStepIndex((current) => Math.max(0, current - 1))
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setGuideStepIndex((current) => {
          if (current >= MAP_VIEW_GUIDE_STEPS.length - 1) {
            finishGuide()
            return current
          }
          return current + 1
        })
      } else if (event.key === 'Escape') {
        event.preventDefault()
        setIsGuideActive(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [finishGuide, isGuideActive])

  const handleGuideNext = useCallback(() => {
    setGuideStepIndex((current) => {
      if (current >= MAP_VIEW_GUIDE_STEPS.length - 1) {
        finishGuide()
        return current
      }
      return current + 1
    })
  }, [finishGuide])

  const handleGuidePrevious = useCallback(() => {
    setGuideStepIndex((current) => Math.max(0, current - 1))
  }, [])

  const guideClassFor = useCallback((stepKey: string) => {
    if (!isGuideActive || !activeGuideStep) return ''
    return ` map-view-guide-target${activeGuideStep.key === stepKey ? ' is-active' : ' is-dimmed'}`
  }, [activeGuideStep, isGuideActive])

  const showPropertyPopup = useCallback((property: DatasurfrMapProperty, zoom = 10) => {
    const map = mapRef.current
    if (!map || !hasPropertyCoordinates(property)) return
    propertyPopupRef.current?.remove()
    const popupHtml = `
      <div class="map-view-popup">
        <div class="map-view-popup-title">${escapeHtml(property.property_name || 'Property')}</div>
        <div class="map-view-popup-meta">${escapeHtml(canonicalPropertyBrand(property) || 'Others')} | ${escapeHtml(property.country || '-')}</div>
        <div class="map-view-popup-meta">${escapeHtml(property.city || '-')} | ${escapeHtml(property.state || '-')}</div>
        <div class="map-view-popup-meta">${escapeHtml(property.region || '-')}</div>
      </div>
    `
    propertyPopupRef.current = new maplibregl.Popup({ offset: 10, closeButton: false })
      .setLngLat([property.longitude, property.latitude])
      .setHTML(popupHtml)
      .addTo(map)
    map.easeTo({
      center: [property.longitude, property.latitude],
      zoom: Math.max(map.getZoom(), zoom),
      duration: 420,
    })
  }, [])

  const handlePropertySearchSelect = useCallback((property: DatasurfrMapProperty) => {
    setShowProperties(true)
    setShowOnlyImpactedProperties(false)
    setSelectedPropertyRegion('all')
    setSelectedPropertyBrand('all')
    setPropertySearch(property.property_name)
    showPropertyPopup(property)
  }, [showPropertyPopup])

  return (
    <section className={`map-view-page${isGuideActive ? ' is-guide-active' : ''}`}>
      {importError ? <div className="map-view-import-error">{importError}</div> : null}

      <div className="map-view-grid">
        <article
          id="map-view-guide-map-panel"
          ref={mapPanelRef}
          className={`map-view-map-panel${isMapFullscreen ? ' is-fullscreen' : ''}${guideClassFor('map-panel')}`}
        >
          <div className="map-view-map-panel-head">
            <div className="map-view-map-panel-controls">
              <div id="map-view-guide-toolbar-controls" className={`map-view-toolbar-controls${guideClassFor('toolbar-controls')}`}>
                <button
                  type="button"
                  className={`map-view-toggle-btn${showProperties ? ' is-active' : ''}`}
                  aria-pressed={showProperties}
                  onClick={() => setShowProperties((previous) => !previous)}
                >
                  Properties
                </button>
                <button
                  type="button"
                  className={`map-view-toggle-btn${showImpactRadii ? ' is-active' : ''}`}
                  aria-pressed={showImpactRadii}
                  disabled={!mappablePriorityAlerts.length}
                  onClick={() => setShowImpactRadii((previous) => !previous)}
                >
                  Impact radius
                </button>
                <button
                  type="button"
                  className={`map-view-toggle-btn${showOnlyImpactedProperties ? ' is-active' : ''}`}
                  aria-pressed={showOnlyImpactedProperties}
                  disabled={!showProperties || !selectedAlert}
                  onClick={() => setShowOnlyImpactedProperties((previous) => !previous)}
                >
                  Only impacted
                </button>
                <label className="map-view-region-filter-inline">
                  <select
                    value={selectedPropertyRegion}
                    disabled={!showProperties}
                    onChange={(event) => setSelectedPropertyRegion(event.target.value)}
                  >
                    <option value="all">All regions</option>
                    {propertyRegionOptions.map((region) => (
                      <option key={region} value={region}>
                        {region}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="map-view-property-search">
                  <button
                    type="button"
                    className={`map-view-toggle-btn map-view-toggle-btn--icon${isPropertySearchOpen ? ' is-active' : ''}`}
                    aria-label={isPropertySearchOpen ? 'Hide property search' : 'Search property'}
                    title={isPropertySearchOpen ? 'Hide property search' : 'Search property'}
                    onClick={() => {
                      setIsPropertySearchOpen((previous) => {
                        const next = !previous
                        if (!next) setPropertySearch('')
                        return next
                      })
                    }}
                  >
                    <Search size={14} />
                  </button>
                  {isPropertySearchOpen ? (
                    <div className="map-view-property-search-popover">
                      <input
                        ref={propertySearchInputRef}
                        type="text"
                        value={propertySearch}
                        placeholder="Search any property"
                        aria-label="Search property on map"
                        onChange={(event) => setPropertySearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && propertySearchResults[0]) {
                            event.preventDefault()
                            handlePropertySearchSelect(propertySearchResults[0])
                          } else if (event.key === 'Escape') {
                            setIsPropertySearchOpen(false)
                            setPropertySearch('')
                          }
                        }}
                      />
                      {propertySearch.trim() ? (
                        <div className="map-view-property-search-results">
                          {propertySearchResults.length ? (
                            propertySearchResults.map((property) => (
                              <button
                                key={`${property.property_name}-${property.latitude}-${property.longitude}`}
                                type="button"
                                className="map-view-property-search-result"
                                onClick={() => handlePropertySearchSelect(property)}
                              >
                                <strong>{property.property_name}</strong>
                                <span>{[property.city, property.state].filter(Boolean).join(', ') || property.region || property.country || '-'}</span>
                              </button>
                            ))
                          ) : (
                            <div className="map-view-property-search-empty">No matching properties.</div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn-ghost map-view-fullscreen-btn"
              onClick={() => void toggleMapFullscreen()}
              aria-label={isMapFullscreen ? 'Exit full screen map' : 'Enter full screen map'}
              title={isMapFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {isMapFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              <span>{isMapFullscreen ? 'Exit Full Screen' : 'Full Screen'}</span>
            </button>
          </div>
          <div ref={mapContainerRef} className="map-view-canvas" />
          {!mappablePriorityAlerts.length && !visibleProperties.length && !isLoading ? (
            <div className="map-view-empty-map">No mappable priority alerts in this time window.</div>
          ) : null}

          {!isMapFullscreen ? (
            <div
              id="map-view-guide-legends"
              className={`map-view-map-legends${showProperties ? '' : ' is-single'}${guideClassFor('legends')}`}
            >
              <div className="map-view-legend-section">
                <div className="map-view-legend-title">
                  News Categories
                  {selectedAlertCategory !== 'all' ? (
                    <button type="button" className="map-view-legend-clear-btn" onClick={() => setSelectedAlertCategory('all')}>
                      Clear
                    </button>
                  ) : null}
                </div>
                <div className="map-view-legend-list">
                  {ALERT_CATEGORY_OPTIONS.filter((option) => option.key !== 'all').map((category) => (
                    <button
                      key={category.key}
                      type="button"
                      className={`map-view-legend-item map-view-legend-item--clickable${selectedAlertCategory === category.key ? ' is-active' : ''}`}
                      onClick={() =>
                        setSelectedAlertCategory((previous) =>
                          previous === category.key ? 'all' : (category.key as FilterableAlertCategoryKey),
                        )
                      }
                    >
                      <span className="map-view-legend-item-main">
                        <span className="map-view-legend-dot" style={{ background: category.color }} />
                        <span className="map-view-legend-name">{category.label}</span>
                      </span>
                      <strong>{categoryCount[category.key as FilterableAlertCategoryKey]}</strong>
                    </button>
                  ))}
                </div>
              </div>

              {showProperties ? (
                <div className="map-view-legend-section map-view-legend-section--regions">
                  <div className="map-view-legend-title">
                    Property Brands
                    {selectedPropertyBrand !== 'all' ? (
                      <button type="button" className="map-view-legend-clear-btn" onClick={() => setSelectedPropertyBrand('all')}>
                        Clear
                      </button>
                    ) : null}
                  </div>
                  <div className="map-view-legend-list">
                    {Object.entries(propertyBrandCounts).map(([brand, count]) => (
                      <button
                        key={brand}
                        type="button"
                        className={`map-view-legend-item map-view-legend-item--clickable${selectedPropertyBrand === brand ? ' is-active' : ''}`}
                        onClick={() => setSelectedPropertyBrand((previous) => (previous === brand ? 'all' : brand))}
                      >
                        <span className="map-view-legend-item-main">
                          <span className="map-view-legend-dot" style={{ background: markerColorByBrand(brand) }} />
                          <span className="map-view-legend-name">{brand}</span>
                        </span>
                        <strong>{count}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </article>

        <aside className="map-view-side-panel">
          <div className="map-view-side-head">
            <h3>Priority Alert List</h3>
            <div className="map-view-side-head-actions">
              <span>{priorityAlerts.length} alerts</span>
              <button type="button" className="btn-ghost map-view-side-head-link" onClick={() => navigate('/datasurfr')}>
                Open Datasurfr Feed
              </button>
            </div>
          </div>

          {selectedAlert ? (
            <div id="map-view-guide-selected-card" className={`map-view-selected-card${guideClassFor('selected-card')}`}>
              <div className="map-view-selected-title">{selectedAlert.event_title}</div>
              <div className="map-view-selected-meta">
                ID {selectedAlert.id} | Score {selectedAlert.hotel_impact_score} |{' '}
                {selectedAlert.latest_update_age_minutes ?? '-'} min ago
              </div>
              <div className="map-view-selected-meta">
                {selectedAlert.risk_category || 'Uncategorized'} | {selectedAlert.sub_risk_category_name || 'Other'}
              </div>
              <div className="map-view-selected-meta">
                {normalizedImpactScope(selectedAlert) === 'Local'
                  ? `Impact radius: ${selectedAlertRadiusKm ?? IMPACT_RADIUS_FALLBACK_KM} km`
                  : `Impact scope: ${normalizedImpactScope(selectedAlert)}`}
              </div>
              <div className="map-view-selected-location">{selectedAlert.event_location || 'Location not available'}</div>
            </div>
          ) : (
            <div id="map-view-guide-selected-card" className={`map-view-empty-selection${guideClassFor('selected-card')}`}>
              Select an alert from the list or map to view details.
            </div>
          )}

          <div id="map-view-guide-priority-list" className={`map-view-alert-list${guideClassFor('priority-list')}`}>
            {sortedPriorityAlerts.map((alert) => {
              const isActive = alert.id === selectedAlertId
              return (
                <button
                  type="button"
                  key={alert.id}
                  className={`map-view-alert-item${isActive ? ' is-active' : ''}`}
                  onClick={() => setSelectedAlertId((previous) => (previous === alert.id ? null : alert.id))}
                >
                  <div className="map-view-alert-item-title">{alert.event_title}</div>
                  <div className="map-view-alert-item-meta">
                    ID {alert.id} | Score {alert.hotel_impact_score} | {alert.latest_update_age_minutes ?? '-'} min ago
                  </div>
                  <div className="map-view-alert-item-meta">
                    {alert.risk_category || 'Uncategorized'} | {alert.event_location || 'Location not available'}
                  </div>
                </button>
              )
            })}
            {!sortedPriorityAlerts.length && !isLoading ? (
              <div className="map-view-empty-selection">No priority alerts found in this time window.</div>
            ) : null}
          </div>
        </aside>
      </div>
      {isGuideActive && activeGuideStep ? (
        <div
          className="map-view-guide-popover"
          style={{ top: `${guidePopoverPosition.top}px`, left: `${guidePopoverPosition.left}px` }}
          role="dialog"
          aria-modal="false"
          aria-label="Map view guide"
        >
          <div className="map-view-guide-progress">Step {guideStepIndex + 1} of {MAP_VIEW_GUIDE_STEPS.length}</div>
          <button
            type="button"
            className="map-view-guide-close-btn btn-danger-action"
            onClick={() => setIsGuideActive(false)}
            aria-label="Close guide"
            title="Close guide"
          >
            <X size={16} />
          </button>
          <h4>{activeGuideStep.title}</h4>
          <p>{activeGuideStep.description}</p>
          <ul className="map-view-guide-points">
            {activeGuideStep.points.map((point, idx) => (
              <li key={`${activeGuideStep.key}-${idx}`}>{point}</li>
            ))}
          </ul>
          <div className="map-view-guide-controls">
            <button
              type="button"
              className="map-view-guide-arrow map-view-guide-arrow--prev"
              onClick={handleGuidePrevious}
              disabled={guideStepIndex === 0}
            >
              Previous
            </button>
            <button type="button" className="map-view-guide-arrow map-view-guide-arrow--next" onClick={handleGuideNext}>
              {guideStepIndex === MAP_VIEW_GUIDE_STEPS.length - 1 ? 'Finish' : <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      ) : null}
      {showGuideDoneMessage ? (
        <div className="map-view-guide-done" role="status" aria-live="polite">
          Map View guide completed.
        </div>
      ) : null}
    </section>
  )
}
