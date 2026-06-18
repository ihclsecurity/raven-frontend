/**
 * Impact Map Email HTML Helpers
 *
 * What this file does
 * -------------------
 * This file builds the email-safe HTML fragment used to embed an impact-map
 * image and its supporting property labels inside advisories.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the HTML builder first, then the width constants or layout helpers it
 * depends on. The file exists to keep the email output consistent even when the
 * browser map renderer changes.
 *
 * When to change this file
 * ------------------------
 * Update this file when the advisory email layout or the map image wrapper
 * needs to change.
 *
 * What this file does not do
 * --------------------------
 * This file does not render the map image itself. It only turns the rendered
 * image into email HTML.
 */

import {
  PROPERTY_LABEL_SIDEBAR_THRESHOLD,
  shouldUsePropertySidebar,
  uniqueSortedImpactMapProperties,
  type ImpactMapPropertySummary,
} from './impactMapPropertyLayout'
import { canonicalPropertyBrand, markerColorByBrand } from './propertyBrandMap'

export const IMPACT_MAP_EMAIL_MEDIA_WIDTH = 568

const PROPERTY_SIDEBAR_EXPANDED_WIDTH = 176
const PROPERTY_SIDEBAR_COMPACT_WIDTH = 152
const PROPERTY_SIDEBAR_GAP_WIDTH = 10
const PROPERTY_BRAND_COLLAPSE_THRESHOLD = 4

type SidebarEntry = { color: string; name: string; count?: number }

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function propertyBrandDetails(property: ImpactMapPropertySummary): { brand: string; color: string } {
  const brand = canonicalPropertyBrand({
    property_name: property.name,
    brand: property.brand || '',
    city: '',
    state: '',
    region: '',
    country: '',
    latitude: 0,
    longitude: 0,
  })
  return { brand, color: markerColorByBrand(brand) }
}

function shouldGroupBrand(propertyCount: number, totalPropertyCount: number): boolean {
  return totalPropertyCount > PROPERTY_LABEL_SIDEBAR_THRESHOLD && propertyCount > PROPERTY_BRAND_COLLAPSE_THRESHOLD
}

function buildSidebarEntries(properties: ImpactMapPropertySummary[]): SidebarEntry[] {
  const totalPropertyCount = properties.length
  const detailedProperties = properties.map((property) => {
    const { brand, color } = propertyBrandDetails(property)
    return { property, brand, color }
  })
  const propertiesByBrand = new Map<string, typeof detailedProperties>()

  detailedProperties.forEach((entry) => {
    const group = propertiesByBrand.get(entry.brand)
    if (group) {
      group.push(entry)
      return
    }
    propertiesByBrand.set(entry.brand, [entry])
  })

  const renderedBrands = new Set<string>()
  const entries: SidebarEntry[] = []

  detailedProperties.forEach((entry) => {
    const groupedProperties = propertiesByBrand.get(entry.brand) || []
    if (shouldGroupBrand(groupedProperties.length, totalPropertyCount)) {
      if (renderedBrands.has(entry.brand)) return
      renderedBrands.add(entry.brand)
      entries.push({
        color: entry.color,
        name: entry.brand,
        count: groupedProperties.length,
      })
      return
    }

    entries.push({
      color: entry.color,
      name: entry.property.name,
    })
  })

  return entries
}

function renderSidebarEntry(entry: SidebarEntry): string {
  const label = entry.count && entry.count > 1 ? `${entry.name} (${entry.count})` : entry.name
  return `
    <tr>
      <td valign="top" width="12" style="padding:2px 6px 5px 0;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${entry.color};border:1px solid rgba(255,255,255,0.55);"></span>
      </td>
      <td valign="top" style="padding:0 0 5px 0;font-family:Aptos,'DM Sans',Arial,Helvetica,sans-serif;font-size:10.75px;line-height:1.3;color:#dbe7f5;">
        ${escapeHtml(label)}
      </td>
    </tr>
  `
}

export function buildImpactMapImageHtml(
  dataUrl: string,
  width = IMPACT_MAP_EMAIL_MEDIA_WIDTH,
  properties: ImpactMapPropertySummary[] = [],
): string {
  const safeWidth = Math.max(1, Math.trunc(width))
  const sortedProperties = uniqueSortedImpactMapProperties(properties)
  if (!shouldUsePropertySidebar(sortedProperties.length)) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="${safeWidth}" style="width:${safeWidth}px;max-width:100%;margin:0 auto;border-collapse:collapse;"><tr><td align="center" style="font-size:0;line-height:0;"><img src="${dataUrl}" alt="Impact Map" width="${safeWidth}" style="display:block;width:${safeWidth}px;max-width:100%;height:auto;border:1px solid #183347;" /></td></tr></table>`
  }

  const sidebarEntries = buildSidebarEntries(sortedProperties)
  const sidebarWidth = safeWidth >= IMPACT_MAP_EMAIL_MEDIA_WIDTH ? PROPERTY_SIDEBAR_EXPANDED_WIDTH : PROPERTY_SIDEBAR_COMPACT_WIDTH
  const gapWidth = PROPERTY_SIDEBAR_GAP_WIDTH
  const mapWidth = Math.max(332, safeWidth - sidebarWidth - gapWidth)
  const propertyCount = sortedProperties.length
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="${safeWidth}" style="width:${safeWidth}px;max-width:100%;margin:0 auto;border-collapse:collapse;">
      <tr>
        <td valign="top" width="${mapWidth}" style="font-size:0;line-height:0;">
          <img src="${dataUrl}" alt="Impact Map" width="${mapWidth}" style="display:block;width:${mapWidth}px;max-width:${mapWidth}px;height:auto;border:1px solid #183347;" />
        </td>
        <td width="${gapWidth}" style="font-size:0;line-height:0;">&nbsp;</td>
        <td valign="top" width="${sidebarWidth}" style="padding:0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${sidebarWidth}" style="width:${sidebarWidth}px;border-collapse:collapse;background:#0b1220;border:1px solid #183347;">
            <tr>
              <td style="padding:8px 9px 8px 9px;border-bottom:1px solid rgba(148,163,184,0.22);font-family:Aptos,'DM Sans',Arial,Helvetica,sans-serif;font-size:10px;line-height:1.3;font-weight:700;color:#f8fafc;letter-spacing:0.8px;text-transform:uppercase;">
                Properties (${propertyCount})
              </td>
            </tr>
            <tr>
              <td style="padding:8px 9px 6px 9px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                  ${sidebarEntries.map((entry) => renderSidebarEntry(entry)).join('')}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `
}
