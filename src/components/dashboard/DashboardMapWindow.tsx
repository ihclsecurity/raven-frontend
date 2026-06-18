/**
 * Module: DashboardMapWindow
 * Purpose: Show the dashboard command-center map directly under the KPI strip.
 * Context: Keep this component focused on map interactions and map-only controls.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import maplibregl, { LngLatBounds } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Maximize2, Minimize2, Search } from 'lucide-react'
import { datasurfrApi } from '../../api/datasurfr'
import { ALERT_CATEGORY_OPTIONS, categorizeAlert, type FilterableAlertCategoryKey } from '../../constants/taxonomy'
import type { DatasurfrAlert, DatasurfrMapProperty } from '../../types/datasurfr'
import { addPoliticalMapLabels } from '../../utils/politicalMapLabels'
import { useAuth } from '../../auth/AuthContext'
import { hasFullAccess } from '../../utils/authRoles'
import {
  canonicalPropertyBrand as sharedCanonicalPropertyBrand,
  markerColorByBrand as sharedMarkerColorByBrand,
} from '../../utils/propertyBrandMap'

const MAP_STYLE_LIGHT_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const MAP_STYLE_DARK_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const IMPACT_RADIUS_FALLBACK_KM = 45
const EARTH_RADIUS_KM = 6371

const PROPERTY_CLUSTER_COLOR = '#b88917'
export const PROPERTY_BRAND_COLORS: Record<string, string> = {
  Taj: '#D4AF37',
  Vivanta: '#7C3AED',
  Ginger: '#FF7A00',
  SeleQtions: '#6B7280',
  'amã Stays & Trails': '#F26419',
  Brij: '#EC4899',
  'Claridges Collection': '#374151',
  Atmantan: '#2563EB',
  'Taj SATS': '#FF1F1F',
  'Tree of Life': '#9AD97D',
  Gateway: '#2AA198',
  'Taj Safaris': '#1F6B3A',
  'Corporate Office': '#2563EB',
  Others: '#1E3A8A',
}

type AlertFeatureProperties = {
  id: string
  markerColor: string
  markerRadius: number
  title: string
  level: string
  score: number
  location: string
}

type PropertyFeatureProperties = {
  id: string
  propertyName: string
  brand: string
  city: string
  state: string
  country: string
  markerColor: string
  isImpacted: number
  region: string
}

type AlertRadiusFeatureProperties = {
  id: string
  radiusKm: number | null
  markerColor: string
  isSelected: number
  scope: string
}

type GenericGeoJsonFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: any
    properties?: Record<string, any>
  }>
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
  if (typeof alert.latitude !== 'number' || typeof alert.longitude !== 'number') return false
  return Math.abs(alert.latitude) <= 90 && Math.abs(alert.longitude) <= 180
}

function hasPropertyCoordinates(property: DatasurfrMapProperty): property is DatasurfrMapProperty & {
  latitude: number
  longitude: number
} {
  if (typeof property.latitude !== 'number' || typeof property.longitude !== 'number') return false
  return Math.abs(property.latitude) <= 90 && Math.abs(property.longitude) <= 180
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

export function canonicalPropertyBrand(property: DatasurfrMapProperty): string {
  const brandText = normalizeText(property.brand)
  const nameText = normalizeText(property.property_name)
  const combined = `${brandText} ${nameText}`.trim()

  if (containsPhrase(combined, 'corporate')) return 'Corporate Office'
  if (containsPhrase(combined, 'taj sats') || containsPhrase(combined, 'tajsats')) return 'Taj SATS'
  if (containsPhrase(combined, 'taj safaris') || containsPhrase(combined, 'taj safari')) return 'Taj Safaris'
  if (containsPhrase(combined, 'tree of life')) return 'Tree of Life'
  if (containsPhrase(combined, 'brij')) return 'Brij'
  if (containsPhrase(combined, 'claridges')) return 'Claridges Collection'
  if (containsPhrase(combined, 'atmantan')) return 'Atmantan'
  if (containsPhrase(combined, 'seleqtions')) return 'SeleQtions'
  if (containsPhrase(combined, 'gateway')) return 'Gateway'
  if (containsPhrase(combined, 'vivanta')) return 'Vivanta'
  if (containsPhrase(combined, 'ginger')) return 'Ginger'
  if (containsPhrase(combined, 'ama') || containsPhrase(combined, 'amã')) return 'amã Stays & Trails'
  if (containsPhrase(combined, 'taj')) return 'Taj'

  return 'Others'
}

export function markerColorByBrand(brand: string): string {
  return sharedMarkerColorByBrand(brand)
}

function normalizedImpactScope(alert: DatasurfrAlert): 'Local' | 'State' | 'National' {
  const scope = String(alert.impact_scope || '').trim().toLowerCase()
  if (scope === 'national') return 'National'
  if (scope === 'state') return 'State'
  return 'Local'
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

function impactRadiusKmForAlert(alert: DatasurfrAlert): number {
  const value = Number(alert.impact_radius_km)
  if (Number.isFinite(value) && value > 0) return Math.round(value)
  return IMPACT_RADIUS_FALLBACK_KM
}

function propertyKeyFromName(value: string | null): string {
  return String(value || '').trim().toLowerCase()
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

type DashboardMapWindowProps = {
  alerts: DatasurfrAlert[]
  isLoading: boolean
  timeWindow: number
}

export function DashboardMapWindow({ alerts, isLoading, timeWindow }: DashboardMapWindowProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canUseActions = hasFullAccess(user)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapPanelRef = useRef<HTMLElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [isMapReady, setIsMapReady] = useState(false)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const propertyPopupRef = useRef<maplibregl.Popup | null>(null)
  const propertySearchInputRef = useRef<HTMLInputElement | null>(null)
  const fitPendingRef = useRef(true)
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null)
  const [showProperties, setShowProperties] = useState(true)
  const [showImpactRadii, setShowImpactRadii] = useState(true)
  const [showOnlyImpactedProperties, setShowOnlyImpactedProperties] = useState(false)
  const [selectedPropertyRegion, setSelectedPropertyRegion] = useState('all')
  const [isPropertySearchOpen, setIsPropertySearchOpen] = useState(false)
  const [propertySearch, setPropertySearch] = useState('')
  const [isMapFullscreen, setIsMapFullscreen] = useState(false)
  const [importingAlertId, setImportingAlertId] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    if (typeof document === 'undefined') return 'light'
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  })
  const [indiaCountryBoundary, setIndiaCountryBoundary] = useState<GenericGeoJsonFeatureCollection | null>(null)
  const [indiaStateBoundaries, setIndiaStateBoundaries] = useState<GenericGeoJsonFeatureCollection | null>(null)
  const isDarkTheme = themeMode === 'dark'
  const mapStyleUrl = isDarkTheme ? MAP_STYLE_DARK_URL : MAP_STYLE_LIGHT_URL

  const propertiesQuery = useQuery({
    queryKey: ['dashboard-map-properties'],
    queryFn: () => datasurfrApi.listMapProperties(),
    staleTime: 300000,
    refetchOnWindowFocus: false,
  })

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

  const priorityAlerts = useMemo(
    () => alerts.filter((alert) => alert.hotel_impact_level === 'high'),
    [alerts],
  )
  const mappablePriorityAlerts = useMemo(
    () => priorityAlerts.filter(hasCoordinates),
    [priorityAlerts],
  )

  const selectedAlert = useMemo(
    () => priorityAlerts.find((alert) => alert.id === selectedAlertId) || null,
    [priorityAlerts, selectedAlertId],
  )

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

  const visibleProperties = useMemo(() => {
    if (selectedPropertyRegion === 'all') return scopedProperties
    return scopedProperties.filter((property) => {
      const region = String(property.region || '').trim() || 'Unknown'
      return region === selectedPropertyRegion
    })
  }, [scopedProperties, selectedPropertyRegion])
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

  const geojsonData = useMemo(() => {
    return {
      type: 'FeatureCollection' as const,
      features: mappablePriorityAlerts.map((alert) => {
        const categoryKey = categorizeAlert(alert)
        const properties: AlertFeatureProperties = {
          id: alert.id,
          markerColor: markerColorByCategory(categoryKey),
          markerRadius: markerRadiusByScore(alert.hotel_impact_score || 0),
          title: alert.event_title || 'Untitled event',
          level: alert.hotel_impact_level || 'low',
          score: alert.hotel_impact_score || 0,
          location: alert.event_location || 'Location not available',
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
        const brand = sharedCanonicalPropertyBrand(property)
        const properties: PropertyFeatureProperties = {
          id: `${key}-${property.latitude}-${property.longitude}`,
          propertyName: property.property_name,
          brand,
          city: property.city || '-',
          state: property.state || '-',
          country: property.country || '-',
          markerColor: sharedMarkerColorByBrand(brand),
          isImpacted: impactedPropertyKeys.has(key) ? 1 : 0,
          region: String(property.region || '').trim() || 'Unknown',
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
    if (!showImpactRadii) return { type: 'FeatureCollection' as const, features: [] }
    const impactOverlayAlerts = selectedAlertId
      ? mappablePriorityAlerts.filter((alert) => alert.id === selectedAlertId)
      : mappablePriorityAlerts
    return {
      type: 'FeatureCollection' as const,
      features: impactOverlayAlerts.flatMap((alert) => {
        const scope = normalizedImpactScope(alert)
        const markerColor = markerColorByCategory(categorizeAlert(alert))
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

  const importAlertMutation = useMutation({
    mutationFn: (alertId: string) => datasurfrApi.importAlerts({ alert_ids: [alertId], time: timeWindow }),
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

  useEffect(() => {
    fitPendingRef.current = true
  }, [alerts.length])

  useEffect(() => {
    if (selectedPropertyRegion === 'all') return
    if (propertyRegionOptions.includes(selectedPropertyRegion)) return
    setSelectedPropertyRegion('all')
  }, [propertyRegionOptions, selectedPropertyRegion])

  useEffect(() => {
    if (!isPropertySearchOpen) return
    propertySearchInputRef.current?.focus()
    propertySearchInputRef.current?.select()
  }, [isPropertySearchOpen])

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
      map.addSource('dashboard-map-properties', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 11,
        clusterRadius: 36,
      })
      map.addSource('dashboard-priority-impact-radii', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addSource('dashboard-priority-alerts', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 44,
      })

      map.addLayer({
        id: 'dashboard-map-properties-clusters',
        type: 'circle',
        source: 'dashboard-map-properties',
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
        id: 'dashboard-map-properties-cluster-count',
        type: 'symbol',
        source: 'dashboard-map-properties',
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Open Sans Bold'], 'text-size': 11 },
        paint: { 'text-color': isDarkTheme ? '#dbeafe' : '#1e3a8a' },
      })
      map.addLayer({
        id: 'dashboard-map-properties-unclustered',
        type: 'circle',
        source: 'dashboard-map-properties',
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
        id: 'dashboard-map-properties-labels',
        type: 'symbol',
        source: 'dashboard-map-properties',
        filter: ['!', ['has', 'point_count']],
        minzoom: 8,
        layout: {
          'text-field': ['get', 'propertyName'],
          'text-font': ['Open Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 12, 12],
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
      map.addLayer({
        id: 'dashboard-priority-impact-radius-fill',
        type: 'fill',
        source: 'dashboard-priority-impact-radii',
        paint: {
          'fill-color': ['coalesce', ['get', 'markerColor'], '#2563eb'],
          'fill-opacity': ['case', ['==', ['get', 'isSelected'], 1], 0.2, 0.1],
        },
      })
      map.addLayer({
        id: 'dashboard-priority-impact-radius-outline',
        type: 'line',
        source: 'dashboard-priority-impact-radii',
        paint: {
          'line-color': ['coalesce', ['get', 'markerColor'], '#2563eb'],
          'line-width': ['case', ['==', ['get', 'isSelected'], 1], 2.2, 1.2],
          'line-opacity': ['case', ['==', ['get', 'isSelected'], 1], 0.75, 0.45],
        },
      })
      map.addLayer({
        id: 'dashboard-priority-alert-clusters',
        type: 'circle',
        source: 'dashboard-priority-alerts',
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
        id: 'dashboard-priority-alert-cluster-count',
        type: 'symbol',
        source: 'dashboard-priority-alerts',
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Open Sans Bold'], 'text-size': 12 },
        paint: { 'text-color': '#ffffff' },
      })
      map.addLayer({
        id: 'dashboard-priority-alert-unclustered',
        type: 'circle',
        source: 'dashboard-priority-alerts',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', 'markerColor'],
          'circle-radius': ['get', 'markerRadius'],
          'circle-opacity': 0.9,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      })

      addPoliticalMapLabels(map, { dark: isDarkTheme })

      map.on('click', 'dashboard-priority-alert-unclustered', (event) => {
        const feature = event.features?.[0]
        if (!feature) return
        const featureId = String(feature.properties?.id || '').trim()
        if (!featureId) return
        setSelectedAlertId((previous) => (previous === featureId ? null : featureId))
      })

      const expandCluster = (sourceId: string, clusterLayerId: string, event: maplibregl.MapLayerMouseEvent) => {
        const features = map.queryRenderedFeatures(event.point, { layers: [clusterLayerId] })
        const clusterFeature = features[0]
        if (!clusterFeature) return
        const clusterId = Number(clusterFeature.properties?.cluster_id)
        const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
        if (!source || !Number.isFinite(clusterId)) return
        void source.getClusterExpansionZoom(clusterId).then((zoomLevel) => {
          const geometry = clusterFeature.geometry
          if (!geometry || geometry.type !== 'Point') return
          map.easeTo({ center: geometry.coordinates as [number, number], zoom: zoomLevel ?? map.getZoom() + 1, duration: 460 })
        })
      }

      map.on('click', 'dashboard-priority-alert-clusters', (event) => expandCluster('dashboard-priority-alerts', 'dashboard-priority-alert-clusters', event))
      map.on('click', 'dashboard-map-properties-clusters', (event) => expandCluster('dashboard-map-properties', 'dashboard-map-properties-clusters', event))

      map.on('click', 'dashboard-map-properties-unclustered', (event) => {
        const feature = event.features?.[0]
        if (!feature) return
        const properties = feature.properties as PropertyFeatureProperties | undefined
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
          layers: ['dashboard-priority-alert-clusters', 'dashboard-priority-alert-unclustered', 'dashboard-map-properties-clusters', 'dashboard-map-properties-unclustered'],
        })
        if (!features.length) {
          setSelectedAlertId(null)
          propertyPopupRef.current?.remove()
          propertyPopupRef.current = null
        }
      })
      map.on('mouseenter', 'dashboard-map-properties-clusters', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'dashboard-map-properties-clusters', () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('mouseenter', 'dashboard-map-properties-unclustered', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'dashboard-map-properties-unclustered', () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('mouseenter', 'dashboard-priority-alert-clusters', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'dashboard-priority-alert-clusters', () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('mouseenter', 'dashboard-priority-alert-unclustered', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'dashboard-priority-alert-unclustered', () => {
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
    const propertySource = map.getSource('dashboard-map-properties') as maplibregl.GeoJSONSource | undefined
    const radiusSource = map.getSource('dashboard-priority-impact-radii') as maplibregl.GeoJSONSource | undefined
    const alertSource = map.getSource('dashboard-priority-alerts') as maplibregl.GeoJSONSource | undefined
    if (propertySource) propertySource.setData(propertyGeojsonData as any)
    if (radiusSource) radiusSource.setData(radiusGeojsonData as any)
    if (alertSource) alertSource.setData(geojsonData as any)

    if (!fitPendingRef.current) return
    const pointsForBounds = geojsonData.features.length > 0 ? geojsonData.features : propertyGeojsonData.features
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
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    const map = mapRef.current
    popupRef.current?.remove()
    popupRef.current = null
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
    scopeNode.textContent =
      normalizedImpactScope(selectedAlert) === 'Local'
        ? `Impact radius: ${impactRadiusKmForAlert(selectedAlert)} km`
        : `Impact scope: ${normalizedImpactScope(selectedAlert)}`
    popupContent.appendChild(scopeNode)

    const locationNode = document.createElement('div')
    locationNode.className = 'map-view-popup-meta'
    locationNode.textContent = selectedAlert.event_location || 'Location not available'
    popupContent.appendChild(locationNode)

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
  }, [canUseActions, importAlertFromMap, importingAlertId, isImportPending, selectedAlert])

  const toggleMapFullscreen = async () => {
    const panel = mapPanelRef.current
    if (!panel) return
    if (document.fullscreenElement === panel) {
      await document.exitFullscreen().catch(() => undefined)
      return
    }
    await panel.requestFullscreen().catch(() => undefined)
  }

  const showPropertyPopup = (property: DatasurfrMapProperty, zoom = 10) => {
    const map = mapRef.current
    if (!map || !hasPropertyCoordinates(property)) return
    propertyPopupRef.current?.remove()
    const popupHtml = `
      <div class="map-view-popup">
        <div class="map-view-popup-title">${escapeHtml(property.property_name || 'Property')}</div>
        <div class="map-view-popup-meta">${escapeHtml(sharedCanonicalPropertyBrand(property) || 'Others')} | ${escapeHtml(property.country || '-')}</div>
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
  }

  const handlePropertySearchSelect = (property: DatasurfrMapProperty) => {
    setShowProperties(true)
    setShowOnlyImpactedProperties(false)
    setSelectedPropertyRegion('all')
    setPropertySearch(property.property_name)
    showPropertyPopup(property)
  }

  return (
    <section className="dashboard-map-window">
      {importError ? <div className="map-view-import-error">{importError}</div> : null}
      <article ref={mapPanelRef} className={`map-view-map-panel${isMapFullscreen ? ' is-fullscreen' : ''}`}>
        <div className="map-view-map-panel-head">
          <div className="map-view-map-panel-controls">
            <div className="map-view-toolbar-controls">
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
                      aria-label="Search property on dashboard map"
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

        {!mappablePriorityAlerts.length && !visibleProperties.length && !isLoading && !propertiesQuery.isLoading ? (
          <div className="map-view-empty-map">No mappable priority alerts in this time window.</div>
        ) : null}
      </article>
    </section>
  )
}
