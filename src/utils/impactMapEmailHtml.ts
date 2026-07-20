/**
 * Impact Property Email HTML Helpers
 *
 * This file builds the email-safe HTML fragment used to show impacted
 * properties inside advisories. It does not render maps or decide which
 * properties are impacted; it only turns the existing impact payload into
 * professional, brand-colored email markup.
 */

import {
  uniqueSortedImpactMapProperties,
  type ImpactMapPropertySummary,
} from './impactMapPropertyLayout'
import { canonicalPropertyBrand, markerColorByBrand } from './propertyBrandMap'

export const IMPACT_MAP_EMAIL_MEDIA_WIDTH = 568

type PropertyChip = { brand: string; color: string; name: string }

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

function buildPropertyChips(properties: ImpactMapPropertySummary[]): PropertyChip[] {
  return properties.map((property) => {
    const { brand, color } = propertyBrandDetails(property)
    return { brand, color, name: property.name }
  })
}

function renderPropertyChip(entry: PropertyChip): string {
  return `
    <span style="display:inline-block;margin:0 7px 8px 0;padding:7px 10px 7px 9px;border:1px solid #d7deea;border-left:4px solid ${entry.color};border-radius:999px;background:#ffffff;font-family:Aptos,'DM Sans',Arial,Helvetica,sans-serif;font-size:11px;line-height:1.25;color:#0b1f3a;vertical-align:top;">
      <span style="display:inline-block;width:7px;height:7px;margin:0 6px 1px 0;border-radius:999px;background:${entry.color};"></span>
      <strong style="font-weight:700;color:#0b1f3a;">${escapeHtml(entry.name)}</strong>
      <span style="color:#64748b;">&nbsp;${escapeHtml(entry.brand)}</span>
    </span>
  `
}

export function buildImpactMapImageHtml(
  _dataUrl: string,
  width = IMPACT_MAP_EMAIL_MEDIA_WIDTH,
  properties: ImpactMapPropertySummary[] = [],
): string {
  const safeWidth = Math.max(1, Math.trunc(width))
  const sortedProperties = uniqueSortedImpactMapProperties(properties)
  const propertyCount = sortedProperties.length
  const chips = buildPropertyChips(sortedProperties).map((entry) => renderPropertyChip(entry)).join('')

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="${safeWidth}" style="width:${safeWidth}px;max-width:100%;margin:0 auto;border-collapse:collapse;">
      <tr>
        <td style="padding:12px 12px 8px 12px;border:1px solid #d7deea;background:#f8fafc;text-align:left;">
          <div style="font-family:Aptos,'DM Sans',Arial,Helvetica,sans-serif;font-size:10px;line-height:1.3;font-weight:800;color:#0b1f3a;letter-spacing:0.9px;text-transform:uppercase;margin-bottom:10px;">
            Properties affected (${propertyCount})
          </div>
          <div style="font-size:0;line-height:0;">
            ${chips || '<span style="font-family:Aptos,Arial,sans-serif;font-size:12px;line-height:1.45;color:#64748b;">No mapped IHCL properties identified.</span>'}
          </div>
        </td>
      </tr>
    </table>
  `
}
