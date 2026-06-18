/**
 * Impact Map Snapshot Renderer
 *
 * What this file does
 * -------------------
 * This file builds the live impact-map snapshot used in email previews and
 * browser-based map rendering. It is the core rendering path that turns alert
 * payloads into a basemap, state boundary overlay, radius circle, and property
 * labels.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the constants first, then the normalization helpers, then the geometry
 * helpers, and finally the rendering entrypoints. That order matches the way a
 * snapshot is assembled from raw payload data.
 *
 * When to change this file
 * ------------------------
 * Update this file when the basemap style, label-placement rules, property
 * color mapping, or snapshot export behavior needs to change.
 *
 * What this file does not do
 * --------------------------
 * This file does not fetch advisories or decide which properties belong in the
 * payload. It only renders a payload that has already been prepared elsewhere.
 */

import maplibregl, { LngLatBounds, type StyleSpecification } from 'maplibre-gl'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { addPoliticalMapLabels } from './politicalMapLabels'
import { canonicalPropertyBrand, markerColorByBrand } from './propertyBrandMap'
import { shouldUsePropertySidebar, type ImpactMapPropertySummary } from './impactMapPropertyLayout'

// Static styling and timing limits keep browser snapshots predictable even
// when the map library or basemap tiles are slow to load.
const MAP_STYLE_DARK_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const SNAPSHOT_FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  glyphs: 'https://basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [
    {
      id: 'snapshot-background',
      type: 'background',
      paint: {
        'background-color': '#05070b',
      },
    },
  ],
}
const EARTH_RADIUS_KM = 6371
const INDIA_CENTER: [number, number] = [78.9629, 22.5937]
const MAP_RENDER_TIMEOUT_MS = 25000
const MAP_STYLE_LOAD_FALLBACK_MS = 8000
const CANVAS_CONTENT_TIMEOUT_MS = 10000
const DEFAULT_WIDTH = 1000
const DEFAULT_HEIGHT = 640
const SNAPSHOT_BACKGROUND_RGB = [5, 7, 11] as const
const SNAPSHOT_CONTENT_LAYER_IDS = [
  'impact-boundary-fill',
  'impact-boundary-line',
  'impact-radius-fill',
  'impact-radius-line',
  'impact-center-circle',
  'impact-properties-circles',
  'impact-properties-labels',
]
const MAP_PLACE_LABELS = [
  { name: 'Srinagar', coordinates: [74.7973, 34.0837] as [number, number], minZoom: 5.5 },
  { name: 'Anantnag', coordinates: [75.1487, 33.7311] as [number, number], minZoom: 6.2 },
  { name: 'Bijbehara', coordinates: [75.0952, 33.7938] as [number, number], minZoom: 7.0 },
  { name: 'Jammu', coordinates: [74.8570, 32.7266] as [number, number], minZoom: 5.7 },
  { name: 'Katra', coordinates: [74.9480, 32.9910] as [number, number], minZoom: 6.5 },
  { name: 'Pathankot', coordinates: [75.6340, 32.2643] as [number, number], minZoom: 6.2 },
  { name: 'Chandigarh', coordinates: [76.7794, 30.7333] as [number, number], minZoom: 5.5 },
  { name: 'Delhi', coordinates: [77.2090, 28.6139] as [number, number], minZoom: 4.5 },
  { name: 'Jaipur', coordinates: [75.7873, 26.9124] as [number, number], minZoom: 4.8 },
  { name: 'Lucknow', coordinates: [80.9462, 26.8467] as [number, number], minZoom: 4.8 },
  { name: 'Bhopal', coordinates: [77.4126, 23.2599] as [number, number], minZoom: 4.8 },
  { name: 'Indore', coordinates: [75.8577, 22.7196] as [number, number], minZoom: 5.5 },
  { name: 'Mumbai', coordinates: [72.8777, 19.0760] as [number, number], minZoom: 4.8 },
  { name: 'Pune', coordinates: [73.8567, 18.5204] as [number, number], minZoom: 5.5 },
  { name: 'Ahmedabad', coordinates: [72.5714, 23.0225] as [number, number], minZoom: 5.0 },
  { name: 'Hyderabad', coordinates: [78.4867, 17.3850] as [number, number], minZoom: 4.8 },
  { name: 'Bengaluru', coordinates: [77.5946, 12.9716] as [number, number], minZoom: 4.8 },
  { name: 'Chennai', coordinates: [80.2707, 13.0827] as [number, number], minZoom: 4.8 },
  { name: 'Kolkata', coordinates: [88.3639, 22.5726] as [number, number], minZoom: 4.8 },
  { name: 'Guwahati', coordinates: [91.7362, 26.1445] as [number, number], minZoom: 5.0 },
  { name: 'Shimla', coordinates: [77.1734, 31.1048] as [number, number], minZoom: 6.0 },
  { name: 'Manali', coordinates: [77.1892, 32.2432] as [number, number], minZoom: 6.5 },
]
const STATE_ALIASES: Record<string, string[]> = {
  'jammu and kashmir': ['jammu & kashmir', 'j&k', 'jk'],
  delhi: ['new delhi', 'nct of delhi', 'national capital territory of delhi'],
  odisha: ['orissa'],
  puducherry: ['pondicherry'],
  'andaman and nicobar': ['andaman and nicobar islands'],
  'daman and diu': ['dadra and nagar haveli and daman and diu'],
}

export type ImpactMapProperty = ImpactMapPropertySummary & {
  latitude: number
  longitude: number
}

type ImpactMapStyle = {
  circle_fill_rgba?: string
  circle_stroke_rgba?: string
  circle_stroke_width?: number
  state_fill_rgba?: string
  state_stroke_rgba?: string
  event_dot_fill?: string
  event_dot_stroke?: string
  event_dot_radius?: number
}

export type ImpactMapPayload = {
  notification_id: number
  mode: 'radius' | 'state' | 'national'
  center_latitude: number | null
  center_longitude: number | null
  radius_km: number | null
  states: string[]
  countries: string[]
  impacted_properties: ImpactMapProperty[]
  style?: ImpactMapStyle
}

type GeoJsonFeature = Feature<Geometry, Record<string, unknown>>
type GeoJsonFeatureCollection = FeatureCollection<Geometry, Record<string, unknown>>

type RenderImpactMapOptions = {
  requireBasemap?: boolean
}

type RenderedImpactMap = {
  destroy: () => void
  map: maplibregl.Map
  toDataUrl: () => string
}

type ProjectedPoint = {
  x: number
  y: number
}

type LabelBox = {
  x: number
  y: number
  width: number
  height: number
}

type ProjectedProperty = {
  property: ImpactMapProperty
  point: ProjectedPoint
}

// Normalization keeps state aliases, brand names, and coordinates comparable
// even when the upstream payload uses different formatting.
function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
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

function stateAliasTokens(value: string | null | undefined): string[] {
  const normalized = normalizeStateBoundaryName(value)
  if (!normalized) return []
  const aliases = STATE_ALIASES[normalized] || []
  const reverseCanonical = Object.entries(STATE_ALIASES)
    .filter(([, aliasValues]) => aliasValues.some((item) => normalizeStateBoundaryName(item) === normalized))
    .map(([canonical]) => canonical)
  return Array.from(new Set([
    normalized,
    ...aliases.map((item) => normalizeStateBoundaryName(item)),
    ...reverseCanonical,
  ].filter(Boolean)))
}

async function loadGeoJson(path: string): Promise<GeoJsonFeatureCollection> {
  const response = await fetch(path, { cache: 'force-cache' })
  if (!response.ok) {
    throw new Error(`Impact map boundary fetch failed: ${path} (${response.status})`)
  }
  const data = await response.json()
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error(`Impact map boundary file is invalid: ${path}`)
  }
  return data as GeoJsonFeatureCollection
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

function createCirclePolygon(lon: number, lat: number, radiusKm: number, segments = 96): [number, number][] {
  const ring: [number, number][] = []
  for (let index = 0; index <= segments; index += 1) {
    const bearing = (index / segments) * Math.PI * 2
    ring.push(destinationPoint(lon, lat, bearing, radiusKm))
  }
  return ring
}

function isValidCoordinate(lon: number, lat: number): boolean {
  return Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90
}

function extendBoundsFromCoordinates(bounds: LngLatBounds, coordinates: unknown): void {
  if (!Array.isArray(coordinates)) return
  if (
    coordinates.length >= 2 &&
    typeof coordinates[0] === 'number' &&
    typeof coordinates[1] === 'number' &&
    isValidCoordinate(coordinates[0], coordinates[1])
  ) {
    bounds.extend([coordinates[0], coordinates[1]])
    return
  }
  for (const item of coordinates) {
    extendBoundsFromCoordinates(bounds, item)
  }
}

function extendBoundsFromFeature(bounds: LngLatBounds, feature: GeoJsonFeature): void {
  if ('coordinates' in feature.geometry) {
    extendBoundsFromCoordinates(bounds, feature.geometry.coordinates)
  }
}

function hasBounds(bounds: LngLatBounds): boolean {
  const west = bounds.getWest()
  const east = bounds.getEast()
  const south = bounds.getSouth()
  const north = bounds.getNorth()
  return [west, east, south, north].every(Number.isFinite) && (west !== east || south !== north)
}

// The property color is derived from the canonical brand so the map and email
// preview use the same marker palette.
function propertyColor(property: ImpactMapProperty): string {
  return markerColorByBrand(
    canonicalPropertyBrand({
      property_name: property.name,
      brand: property.brand || '',
      city: '',
      state: '',
      region: '',
      country: '',
      latitude: property.latitude,
      longitude: property.longitude,
    }),
  )
}

function validProperties(payload: ImpactMapPayload): ImpactMapProperty[] {
  return payload.impacted_properties.filter((property) => isValidCoordinate(property.longitude, property.latitude))
}

function styleValue<K extends keyof ImpactMapStyle>(
  payload: ImpactMapPayload,
  key: K,
  fallback: NonNullable<ImpactMapStyle[K]>,
): NonNullable<ImpactMapStyle[K]> {
  const value = payload.style?.[key]
  return (value == null ? fallback : value) as NonNullable<ImpactMapStyle[K]>
}

function canvasHasVisibleContent(canvas: HTMLCanvasElement): boolean {
  const sampleSize = 64
  const sample = document.createElement('canvas')
  sample.width = sampleSize
  sample.height = sampleSize
  const context = sample.getContext('2d', { willReadFrequently: true })
  if (!context) return false

  try {
    context.drawImage(canvas, 0, 0, sampleSize, sampleSize)
    const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data
    let minR = 255
    let minG = 255
    let minB = 255
    let maxR = 0
    let maxG = 0
    let maxB = 0
    let changedPixels = 0

    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index]
      const g = pixels[index + 1]
      const b = pixels[index + 2]
      minR = Math.min(minR, r)
      minG = Math.min(minG, g)
      minB = Math.min(minB, b)
      maxR = Math.max(maxR, r)
      maxG = Math.max(maxG, g)
      maxB = Math.max(maxB, b)

      if (
        Math.abs(r - SNAPSHOT_BACKGROUND_RGB[0]) > 4 ||
        Math.abs(g - SNAPSHOT_BACKGROUND_RGB[1]) > 4 ||
        Math.abs(b - SNAPSHOT_BACKGROUND_RGB[2]) > 4
      ) {
        changedPixels += 1
      }
    }

    const channelSpread = (maxR - minR) + (maxG - minG) + (maxB - minB)
    return channelSpread > 18 && changedPixels > 12
  } catch (error) {
    console.warn('[impact-map] Unable to inspect map canvas pixels before export', error)
    return false
  }
}

function boxesOverlap(a: LabelBox, b: LabelBox, padding = 2): boolean {
  return !(
    a.x + a.width + padding < b.x ||
    b.x + b.width + padding < a.x ||
    a.y + a.height + padding < b.y ||
    b.y + b.height + padding < a.y
  )
}

function boxIsInsideCanvas(box: LabelBox, width: number, height: number): boolean {
  return box.x >= 4 && box.y >= 4 && box.x + box.width <= width - 4 && box.y + box.height <= height - 4
}

function drawHaloText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fillStyle: string,
  haloStyle = '#020617',
  haloWidth = 3,
): void {
  context.lineJoin = 'round'
  context.lineWidth = haloWidth
  context.strokeStyle = haloStyle
  context.fillStyle = fillStyle
  context.strokeText(text, x, y)
  context.fillText(text, x, y)
}

function renderedFeatureCount(map: maplibregl.Map): number {
  try {
    const layers = SNAPSHOT_CONTENT_LAYER_IDS.filter((layerId) => map.getLayer(layerId))
    if (!layers.length) return 0
    return map.queryRenderedFeatures(undefined, { layers }).length
  } catch {
    return 0
  }
}

function projectedCanvasPoint(map: maplibregl.Map, lon: number, lat: number, scaleX: number, scaleY: number): ProjectedPoint {
  const point = map.project([lon, lat])
  return { x: point.x * scaleX, y: point.y * scaleY }
}

function drawCoordinatePath(
  context: CanvasRenderingContext2D,
  map: maplibregl.Map,
  coordinates: unknown,
  scaleX: number,
  scaleY: number,
): void {
  if (!Array.isArray(coordinates) || !coordinates.length) return
  if (
    Array.isArray(coordinates[0]) &&
    typeof coordinates[0][0] === 'number' &&
    typeof coordinates[0][1] === 'number'
  ) {
    coordinates.forEach((coordinate, index) => {
      const point = projectedCanvasPoint(map, coordinate[0], coordinate[1], scaleX, scaleY)
      if (index === 0) {
        context.moveTo(point.x, point.y)
      } else {
        context.lineTo(point.x, point.y)
      }
    })
    return
  }
  for (const child of coordinates) {
    drawCoordinatePath(context, map, child, scaleX, scaleY)
  }
}

function drawFeatureGeometry(
  context: CanvasRenderingContext2D,
  map: maplibregl.Map,
  feature: GeoJsonFeature,
  scaleX: number,
  scaleY: number,
): void {
  if (!('coordinates' in feature.geometry)) return
  context.beginPath()
  drawCoordinatePath(context, map, feature.geometry.coordinates, scaleX, scaleY)
  context.closePath()
}

function featureCenter(feature: GeoJsonFeature): [number, number] | null {
  if (!('coordinates' in feature.geometry)) return null
  const points: [number, number][] = []
  const collect = (coordinates: unknown): void => {
    if (!Array.isArray(coordinates)) return
    if (
      coordinates.length >= 2 &&
      typeof coordinates[0] === 'number' &&
      typeof coordinates[1] === 'number' &&
      isValidCoordinate(coordinates[0], coordinates[1])
    ) {
      points.push([coordinates[0], coordinates[1]])
      return
    }
    coordinates.forEach(collect)
  }
  collect(feature.geometry.coordinates)
  if (!points.length) return null
  const lon = points.reduce((sum, point) => sum + point[0], 0) / points.length
  const lat = points.reduce((sum, point) => sum + point[1], 0) / points.length
  return [lon, lat]
}

// Label placement is intentionally defensive because the snapshot must avoid
// collisions and keep the important labels readable when the map is dense.
function placeLabel(
  context: CanvasRenderingContext2D,
  text: string,
  anchor: ProjectedPoint,
  occupied: LabelBox[],
  canvasWidth: number,
  canvasHeight: number,
  options: {
    fillStyle: string
    font: string
    haloStyle?: string
    haloWidth?: number
    offsets?: Array<[number, number]>
    leaderLine?: boolean
  },
): void {
  context.font = options.font
  context.textBaseline = 'top'
  const width = Math.min(context.measureText(text).width, 240)
  const height = Number.parseFloat(options.font) || 12
  const offsets = options.offsets || [
    [9, -7],
    [9, 7],
    [-width - 9, -7],
    [-width - 9, 7],
    [9, -22],
    [-width - 9, -22],
    [9, 22],
    [-width - 9, 22],
    [-width / 2, -32],
    [-width / 2, 28],
  ]

  let chosen: LabelBox | null = null
  for (const [offsetX, offsetY] of offsets) {
    const box = { x: anchor.x + offsetX, y: anchor.y + offsetY, width, height }
    if (!boxIsInsideCanvas(box, canvasWidth, canvasHeight)) continue
    if (occupied.some((item) => boxesOverlap(item, box, 3))) continue
    chosen = box
    break
  }
  if (!chosen) {
    const box = {
      x: Math.min(Math.max(anchor.x + 9, 4), canvasWidth - width - 4),
      y: Math.min(Math.max(anchor.y + 9 + occupied.length * 2, 4), canvasHeight - height - 4),
      width,
      height,
    }
    chosen = box
  }

  if (options.leaderLine) {
    context.beginPath()
    context.moveTo(anchor.x, anchor.y)
    context.lineTo(chosen.x, chosen.y + chosen.height / 2)
    context.strokeStyle = 'rgba(226, 232, 240, 0.42)'
    context.lineWidth = 0.75
    context.stroke()
  }

  drawHaloText(context, text, chosen.x, chosen.y, options.fillStyle, options.haloStyle, options.haloWidth)
  occupied.push(chosen)
}

function distanceBetween(a: ProjectedPoint, b: ProjectedPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// Dense property groups are clustered before drawing so one brand can collapse
// into a shared label instead of stacking unreadable text on top of itself.
function clusterProjectedProperties(items: ProjectedProperty[]): ProjectedProperty[][] {
  const clusters: ProjectedProperty[][] = []
  for (const item of items) {
    const cluster = clusters.find((candidate) => {
      const center = candidate.reduce(
        (sum, entry) => ({ x: sum.x + entry.point.x / candidate.length, y: sum.y + entry.point.y / candidate.length }),
        { x: 0, y: 0 },
      )
      return distanceBetween(center, item.point) < 34
    })
    if (cluster) {
      cluster.push(item)
    } else {
      clusters.push([item])
    }
  }
  return clusters
}

function drawClusteredPropertyLabels(
  context: CanvasRenderingContext2D,
  cluster: ProjectedProperty[],
  occupiedLabels: LabelBox[],
  canvasWidth: number,
  canvasHeight: number,
  font: string,
): void {
  const ordered = [...cluster].sort((a, b) => a.point.y - b.point.y || a.point.x - b.point.x)
  const center = ordered.reduce(
    (sum, item) => ({ x: sum.x + item.point.x / ordered.length, y: sum.y + item.point.y / ordered.length }),
    { x: 0, y: 0 },
  )
  context.font = font
  context.textBaseline = 'top'
  const lineHeight = Math.max(14, (Number.parseFloat(font) || 12) + 3)
  const maxWidth = Math.min(
    Math.max(...ordered.map((item) => context.measureText(item.property.name).width)),
    260,
  )
  const side = center.x + maxWidth + 36 < canvasWidth ? 1 : -1
  const labelX = side === 1 ? center.x + 22 : center.x - maxWidth - 22
  let startY = Math.min(Math.max(center.y - (ordered.length * lineHeight) / 2, 8), canvasHeight - ordered.length * lineHeight - 8)

  let guard = 0
  while (
    guard < 40 &&
    ordered.some((_item, index) => {
      const box = { x: labelX, y: startY + index * lineHeight, width: maxWidth, height: lineHeight }
      return occupiedLabels.some((existing) => boxesOverlap(existing, box, 4))
    })
  ) {
    startY += 6
    if (startY + ordered.length * lineHeight > canvasHeight - 8) {
      startY = Math.max(8, center.y - (ordered.length * lineHeight) / 2 - 6 * guard)
    }
    guard += 1
  }

  ordered.forEach((item, index) => {
    const y = startY + index * lineHeight
    const targetX = side === 1 ? labelX - 4 : labelX + maxWidth + 4
    context.beginPath()
    context.moveTo(item.point.x, item.point.y)
    context.lineTo(targetX, y + lineHeight / 2)
    context.strokeStyle = 'rgba(226, 232, 240, 0.38)'
    context.lineWidth = 0.75
    context.stroke()
    drawHaloText(context, item.property.name, labelX, y, '#e2e8f0', '#020617', 3)
    occupiedLabels.push({ x: labelX, y, width: maxWidth, height: lineHeight })
  })
}

// The canvas exporter is the final step that turns the rendered map into the
// PNG data URL used by email preview and snapshot endpoints.
function exportImpactMapCanvas(
  map: maplibregl.Map,
  payload: ImpactMapPayload,
  properties: ImpactMapProperty[],
  boundaryFeatures: GeoJsonFeature[],
  contextFeatures: GeoJsonFeature[],
  options: { backupOverlays?: boolean } = {},
): HTMLCanvasElement {
  const sourceCanvas = map.getCanvas()
  const output = document.createElement('canvas')
  output.width = sourceCanvas.width || DEFAULT_WIDTH
  output.height = sourceCanvas.height || DEFAULT_HEIGHT
  const context = output.getContext('2d')
  if (!context) return output

  context.fillStyle = '#05070b'
  context.fillRect(0, 0, output.width, output.height)
  try {
    context.drawImage(sourceCanvas, 0, 0, output.width, output.height)
  } catch {
    // If WebGL readback is unavailable, the deterministic overlays below still render.
  }

  const rect = sourceCanvas.getBoundingClientRect()
  const scaleX = output.width / Math.max(rect.width || DEFAULT_WIDTH, 1)
  const scaleY = output.height / Math.max(rect.height || DEFAULT_HEIGHT, 1)
  const occupiedLabels: LabelBox[] = []

  if (options.backupOverlays && contextFeatures.length) {
    context.save()
    context.strokeStyle = 'rgba(96, 165, 250, 0.42)'
    context.lineWidth = 0.8 * scaleX
    for (const feature of contextFeatures) {
      drawFeatureGeometry(context, map, feature, scaleX, scaleY)
      context.stroke()
    }
    context.restore()
  }

  if (options.backupOverlays && boundaryFeatures.length) {
    for (const feature of boundaryFeatures) {
      drawFeatureGeometry(context, map, feature, scaleX, scaleY)
      context.fillStyle = styleValue(payload, 'state_fill_rgba', 'rgba(6, 40, 31, 0.42)')
      context.strokeStyle = styleValue(payload, 'state_stroke_rgba', 'rgba(15, 138, 130, 0.78)')
      context.lineWidth = Number(styleValue(payload, 'circle_stroke_width', 2)) * scaleX
      context.fill()
      context.stroke()
    }
  }

  const zoom = map.getZoom()
  context.save()
  if (options.backupOverlays) {
    for (const feature of contextFeatures) {
      const label = String(feature.properties?.NAME_1 || feature.properties?.name || '').trim()
      const center = featureCenter(feature)
      if (!label || !center) continue
      const point = projectedCanvasPoint(map, center[0], center[1], scaleX, scaleY)
      if (point.x < -50 || point.y < -50 || point.x > output.width + 50 || point.y > output.height + 50) continue
      placeLabel(context, label.toUpperCase(), point, occupiedLabels, output.width, output.height, {
        fillStyle: 'rgba(148, 163, 184, 0.58)',
        font: `${Math.max(10, 11 * scaleX)}px "Open Sans", sans-serif`,
        haloStyle: 'rgba(2, 6, 23, 0.9)',
        haloWidth: 2,
        offsets: [[-40 * scaleX, -8 * scaleY], [8 * scaleX, -8 * scaleY], [-40 * scaleX, 10 * scaleY]],
      })
    }
    for (const place of MAP_PLACE_LABELS) {
      if (zoom < place.minZoom) continue
      const point = projectedCanvasPoint(map, place.coordinates[0], place.coordinates[1], scaleX, scaleY)
      if (point.x < -20 || point.y < -20 || point.x > output.width + 20 || point.y > output.height + 20) continue
      placeLabel(context, place.name, point, occupiedLabels, output.width, output.height, {
        fillStyle: 'rgba(203, 213, 225, 0.76)',
        font: `${Math.max(10, 11 * scaleX)}px "Open Sans", sans-serif`,
        haloStyle: 'rgba(2, 6, 23, 0.92)',
        haloWidth: 2.4,
        offsets: [[6 * scaleX, 3 * scaleY], [-45 * scaleX, 3 * scaleY], [6 * scaleX, -16 * scaleY]],
      })
    }
  }
  context.restore()

  if (options.backupOverlays &&
    payload.center_latitude != null &&
    payload.center_longitude != null &&
    payload.radius_km != null &&
    payload.radius_km > 0
  ) {
    const ring = createCirclePolygon(payload.center_longitude, payload.center_latitude, payload.radius_km)
    context.beginPath()
    ring.forEach(([lon, lat], index) => {
      const point = projectedCanvasPoint(map, lon, lat, scaleX, scaleY)
      if (index === 0) {
        context.moveTo(point.x, point.y)
      } else {
        context.lineTo(point.x, point.y)
      }
    })
    context.closePath()
    context.fillStyle = styleValue(payload, 'circle_fill_rgba', 'rgba(15, 138, 130, 0.22)')
    context.strokeStyle = styleValue(payload, 'circle_stroke_rgba', 'rgba(15, 138, 130, 0.82)')
    context.lineWidth = Number(styleValue(payload, 'circle_stroke_width', 2)) * scaleX
    context.fill()
    context.stroke()

    const center = projectedCanvasPoint(map, payload.center_longitude, payload.center_latitude, scaleX, scaleY)
    context.beginPath()
    context.arc(center.x, center.y, Number(styleValue(payload, 'event_dot_radius', 8)) * scaleX, 0, Math.PI * 2)
    context.fillStyle = styleValue(payload, 'event_dot_fill', '#22b8cf')
    context.strokeStyle = styleValue(payload, 'event_dot_stroke', '#ffffff')
    context.lineWidth = 1.25 * scaleX
    context.fill()
    context.stroke()
  }

  for (const property of properties) {
    const point = projectedCanvasPoint(map, property.longitude, property.latitude, scaleX, scaleY)
    if (options.backupOverlays) {
      context.beginPath()
      context.arc(point.x, point.y, 5.2 * scaleX, 0, Math.PI * 2)
      context.fillStyle = propertyColor(property)
      context.strokeStyle = '#ffffff'
      context.lineWidth = 1.5 * scaleX
      context.fill()
      context.stroke()
    }

    occupiedLabels.push({
      x: point.x - 7 * scaleX,
      y: point.y - 7 * scaleY,
      width: 14 * scaleX,
      height: 14 * scaleY,
    })
  }

  if (shouldUsePropertySidebar(properties.length)) {
    return output
  }

  const projectedProperties = properties
    .map((property) => ({
      property,
      point: projectedCanvasPoint(map, property.longitude, property.latitude, scaleX, scaleY),
    }))
    .sort((a, b) => a.point.y - b.point.y || a.point.x - b.point.x)
  for (const cluster of clusterProjectedProperties(projectedProperties)) {
    if (cluster.length > 1) {
      drawClusteredPropertyLabels(
        context,
        cluster,
        occupiedLabels,
        output.width,
        output.height,
        `${Math.max(10, 12 * scaleX)}px "Open Sans", sans-serif`,
      )
      continue
    }
    const item = cluster[0]
    placeLabel(context, item.property.name, item.point, occupiedLabels, output.width, output.height, {
      fillStyle: '#e2e8f0',
      font: `${Math.max(10, 12 * scaleX)}px "Open Sans", sans-serif`,
      haloStyle: '#020617',
      haloWidth: 3 * scaleX,
      leaderLine: true,
    })
  }

  return output
}

// Context features are loaded first because the impact map needs both the
// relevant boundaries and the broader geography around the event.
async function contextFeaturesForPayload(payload: ImpactMapPayload): Promise<GeoJsonFeature[]> {
  const countries = new Set((payload.countries.length ? payload.countries : ['India']).map((item) => normalizeText(item)))
  if (!countries.has('india')) return []
  try {
    return (await loadGeoJson('/geo/india-states.geojson')).features
  } catch {
    return []
  }
}

// Boundary features depend on the payload geography, which is why they are
// resolved separately from the wider context map.
async function boundaryFeaturesForPayload(payload: ImpactMapPayload): Promise<GeoJsonFeature[]> {
  if (payload.mode === 'national') {
    const countries = new Set((payload.countries.length ? payload.countries : ['India']).map((item) => normalizeText(item)))
    if (!countries.has('india')) return []
    try {
      const stateBoundaries = await loadGeoJson('/geo/india-states.geojson')
      if (stateBoundaries.features.length) {
        return stateBoundaries.features
      }
    } catch {
      // Fall back to the coarse country file if the detailed state asset is unavailable.
    }
    return (await loadGeoJson('/geo/india-country.geojson')).features
  }

  if (payload.mode === 'state') {
    if (!payload.states.length) return []
    const scopedStates = new Set(payload.states.flatMap((item) => stateAliasTokens(item)))
    const stateBoundaries = await loadGeoJson('/geo/india-states.geojson')
    const features = stateBoundaries.features.filter((feature) => {
      const boundaryName = String(feature.properties?.NAME_1 || feature.properties?.name || '')
      return scopedStates.has(normalizeStateBoundaryName(boundaryName))
    })
    if (!features.length) {
      console.warn('[impact-map] State boundary not found, falling back to property-only framing', payload.states)
      return []
    }
    return features
  }

  return []
}

// The browser renderer mounts the live map into a DOM node for the in-app
// preview, while the snapshot helper below converts the same payload into an
// image for email output.
export async function renderImpactMapIntoContainer(
  container: HTMLElement,
  payload: ImpactMapPayload,
  options: RenderImpactMapOptions = {},
): Promise<RenderedImpactMap | null> {
  const requireBasemap = options.requireBasemap === true
  const properties = validProperties(payload)
  const hasRadius =
    payload.center_latitude != null &&
    payload.center_longitude != null &&
    payload.radius_km != null &&
    payload.radius_km > 0 &&
    isValidCoordinate(payload.center_longitude, payload.center_latitude)
  const [boundaryFeatures, contextFeatures] = await Promise.all([
    boundaryFeaturesForPayload(payload),
    contextFeaturesForPayload(payload),
  ])

  if (!hasRadius && !boundaryFeatures.length && !properties.length) {
    console.error('[impact-map] No renderable geometry in payload', payload)
    return null
  }

  const initialCenter: [number, number] = hasRadius
    ? [payload.center_longitude as number, payload.center_latitude as number]
    : properties[0]
      ? [properties[0].longitude, properties[0].latitude]
      : INDIA_CENTER

  const createMap = (style: string | StyleSpecification) =>
    new maplibregl.Map({
      container,
      style,
      center: initialCenter,
      zoom: hasRadius ? 6 : 4.6,
      attributionControl: false,
      interactive: false,
      fadeDuration: 0,
      canvasContextAttributes: {
        preserveDrawingBuffer: true,
        antialias: true,
      },
    })

  let map = createMap(MAP_STYLE_DARK_URL)

  await new Promise<void>((resolve, reject) => {
    let settled = false
    let paintFallback: number | null = null
    let styleFallback: number | null = null
    let usingFallbackStyle = false
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      if (paintFallback != null) window.clearTimeout(paintFallback)
      if (styleFallback != null) window.clearTimeout(styleFallback)
      console.error('[impact-map] Browser render failed', error, payload)
      try {
        map.remove()
      } catch {
        // Ignore cleanup failures during rejection.
      }
      reject(error)
    }
    const finishAfterPaint = () => {
      if (settled) return
      const finish = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        if (paintFallback != null) window.clearTimeout(paintFallback)
        if (styleFallback != null) window.clearTimeout(styleFallback)
        resolve()
      }
      const contentDeadline = window.performance.now() + CANVAS_CONTENT_TIMEOUT_MS
      const waitForVisibleCanvas = () => {
        if (settled) return
        const hasVisibleMapCanvas = canvasHasVisibleContent(map.getCanvas())
        const hasAllTiles = typeof map.areTilesLoaded === 'function' ? map.areTilesLoaded() : true
        const canFinish = requireBasemap
          ? hasVisibleMapCanvas && hasAllTiles
          : canvasHasVisibleContent(exportImpactMapCanvas(map, payload, properties, boundaryFeatures, contextFeatures, { backupOverlays: true }))
        if (canFinish) {
          finish()
          return
        }
        if (window.performance.now() >= contentDeadline) {
          const center = map.getCenter()
          fail(
            new Error(
              `Impact map canvas stayed blank after layers rendered; basemap=${hasVisibleMapCanvas} tiles=${hasAllTiles} features=${renderedFeatureCount(map)} ` +
                `zoom=${map.getZoom().toFixed(2)} center=${center.lng.toFixed(4)},${center.lat.toFixed(4)}`,
            ),
          )
          return
        }
        map.triggerRepaint()
        paintFallback = window.setTimeout(() => {
          window.requestAnimationFrame(waitForVisibleCanvas)
        }, 250)
      }
      const waitForAnimationFrames = () => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(waitForVisibleCanvas)
        })
      }
      paintFallback = window.setTimeout(waitForAnimationFrames, 1800)
      map.once('render', waitForAnimationFrames)
      map.triggerRepaint()
    }
    const timeout = window.setTimeout(() => fail(new Error('Impact map render timed out in browser')), MAP_RENDER_TIMEOUT_MS)
    const renderLayers = () => {
      if (settled) return
      if (styleFallback != null) {
        window.clearTimeout(styleFallback)
        styleFallback = null
      }
      const bounds = new LngLatBounds()
      addPoliticalMapLabels(map, { dark: true })

      if (boundaryFeatures.length) {
        map.addSource('impact-boundary', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: boundaryFeatures,
          },
        })
        map.addLayer({
          id: 'impact-boundary-fill',
          type: 'fill',
          source: 'impact-boundary',
          paint: { 'fill-color': styleValue(payload, 'state_fill_rgba', 'rgba(6, 40, 31, 0.24)'), 'fill-opacity': usingFallbackStyle ? 0.5 : 1 },
        })
        map.addLayer({
          id: 'impact-boundary-line',
          type: 'line',
          source: 'impact-boundary',
          paint: { 'line-color': styleValue(payload, 'state_stroke_rgba', 'rgba(15, 138, 130, 0.7)'), 'line-width': 1.3, 'line-opacity': 1 },
        })
        for (const feature of boundaryFeatures) {
          extendBoundsFromFeature(bounds, feature)
        }
      }

      if (hasRadius) {
        const ring = createCirclePolygon(payload.center_longitude as number, payload.center_latitude as number, payload.radius_km as number)
        map.addSource('impact-radius', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [ring] },
                properties: {},
              },
            ],
          },
        })
        map.addLayer({
          id: 'impact-radius-fill',
          type: 'fill',
          source: 'impact-radius',
          paint: { 'fill-color': styleValue(payload, 'circle_fill_rgba', 'rgba(15, 138, 130, 0.2)'), 'fill-opacity': 1 },
        })
        map.addLayer({
          id: 'impact-radius-line',
          type: 'line',
          source: 'impact-radius',
          paint: {
            'line-color': styleValue(payload, 'circle_stroke_rgba', 'rgba(15, 138, 130, 0.75)'),
            'line-width': Number(styleValue(payload, 'circle_stroke_width', 2)),
            'line-opacity': 1,
          },
        })
        for (const point of ring) bounds.extend(point)

        map.addSource('impact-center', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [payload.center_longitude as number, payload.center_latitude as number],
                },
                properties: {},
              },
            ],
          },
        })
        map.addLayer({
          id: 'impact-center-circle',
          type: 'circle',
          source: 'impact-center',
          paint: {
            'circle-radius': Number(styleValue(payload, 'event_dot_radius', 8)),
            'circle-color': styleValue(payload, 'event_dot_fill', '#22b8cf'),
            'circle-stroke-width': 1.5,
            'circle-stroke-color': styleValue(payload, 'event_dot_stroke', '#ffffff'),
          },
        })
      }

      const features = properties.map((property) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [property.longitude, property.latitude] as [number, number],
        },
        properties: {
          name: property.name,
          brand: property.brand || '',
          color: propertyColor(property),
        },
      }))

      for (const property of properties) {
        bounds.extend([property.longitude, property.latitude])
      }

      map.addSource('impact-properties', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features,
        },
      })

      map.addLayer({
        id: 'impact-properties-circles',
        type: 'circle',
        source: 'impact-properties',
        paint: {
          'circle-radius': 5.2,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      })
      if (hasBounds(bounds)) {
        map.fitBounds(bounds, { padding: hasRadius ? 44 : 26, duration: 0, maxZoom: hasRadius ? 9.25 : 8.6 })
      }

      finishAfterPaint()
    }
    styleFallback = window.setTimeout(() => {
      if (settled || map.loaded()) return
      if (requireBasemap) {
        fail(new Error('Impact map basemap style did not load; cannot create a true map snapshot.'))
        return
      }
      console.warn('[impact-map] External map style did not load in time; using local snapshot fallback style')
      usingFallbackStyle = true
      try {
        map.remove()
      } catch {
        // Ignore cleanup from a partially loaded map.
      }
      map = createMap(SNAPSHOT_FALLBACK_STYLE)
      map.on('load', renderLayers)
    }, MAP_STYLE_LOAD_FALLBACK_MS)
    map.on('error', (event) => {
      // Tile/glyph requests can fail transiently in headless capture. Do not fail the
      // snapshot after the base style has loaded; our advisory overlays are local data.
      console.warn('[impact-map] MapLibre reported a non-fatal render error', event.error || event)
    })
    map.on('load', renderLayers)
  })

  return {
    map,
    destroy: () => {
      map.remove()
    },
    toDataUrl: () =>
      exportImpactMapCanvas(map, payload, properties, boundaryFeatures, contextFeatures, { backupOverlays: !requireBasemap }).toDataURL('image/png'),
  }
}

export async function renderImpactMapImage(
  payload: ImpactMapPayload,
  options: RenderImpactMapOptions = {},
): Promise<string | null> {
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '-99999px'
  host.style.top = '0'
  host.style.width = `${DEFAULT_WIDTH}px`
  host.style.height = `${DEFAULT_HEIGHT}px`
  document.body.appendChild(host)

  try {
    const rendered = await renderImpactMapIntoContainer(host, payload, options)
    if (!rendered) {
      return null
    }
    const dataUrl = rendered.toDataUrl()
    rendered.destroy()
    return dataUrl
  } finally {
    host.remove()
  }
}
