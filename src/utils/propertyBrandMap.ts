/**
 * Property Brand Mapping Helpers
 *
 * What this file does
 * -------------------
 * This file normalizes property brand names and maps them to the marker colors
 * used by the map and email preview.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the canonical brand helpers first, then the color lookup. The brand map
 * is what keeps the same property cluster visually consistent everywhere.
 *
 * When to change this file
 * ------------------------
 * Update this file when a new brand is introduced or when a color assignment
 * changes.
 *
 * What this file does not do
 * --------------------------
 * This file does not infer property location or render the map. It only
 * standardizes brand identity.
 */

import type { DatasurfrMapProperty } from '../types/datasurfr'

export const PROPERTY_MARKER_COLOR = '#d4a72c'
export const PROPERTY_CLUSTER_COLOR = '#b88917'

export const PROPERTY_BRAND_COLORS: Record<string, string> = {
  Taj: '#D4AF37',
  Vivanta: '#7C3AED',
  Ginger: '#FF7A00',
  SeleQtions: '#6B7280',
  'ama Stays & Trails': '#F26419',
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
  if (
    containsPhrase(combined, 'ama')
    || containsPhrase(combined, 'am stays')
  ) {
    return 'ama Stays & Trails'
  }
  if (containsPhrase(combined, 'taj')) return 'Taj'

  return 'Others'
}

export function markerColorByBrand(brand: string): string {
  return PROPERTY_BRAND_COLORS[brand] || PROPERTY_MARKER_COLOR
}
