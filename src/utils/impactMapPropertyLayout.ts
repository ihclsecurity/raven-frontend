/**
 * Impact Map Property Layout Rules
 *
 * What this file does
 * -------------------
 * This file keeps the property-label density rules consistent between the map
 * renderer and the email preview.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Start with the sidebar threshold, then read the dedupe helper. The threshold
 * determines when labels move out of the map and into a side list.
 *
 * When to change this file
 * ------------------------
 * Update this file when the property label density rule changes or when the UI
 * needs a different uniqueness rule.
 *
 * What this file does not do
 * --------------------------
 * This file does not decide map placement or branding. It only applies the
 * label-density rule.
 */

export type ImpactMapPropertySummary = {
  name: string
  brand?: string | null
}

// Once property counts get large enough, labels become unreadable inside the
// map itself, so the renderer moves them into a dedicated sidebar list.
export const PROPERTY_LABEL_SIDEBAR_THRESHOLD = 8

export function shouldUsePropertySidebar(propertyCount: number): boolean {
  return propertyCount > PROPERTY_LABEL_SIDEBAR_THRESHOLD
}

export function uniqueSortedImpactMapProperties<T extends ImpactMapPropertySummary>(properties: T[]): T[] {
  const seen = new Set<string>()
  const unique: T[] = []
  for (const property of properties) {
    const name = String(property.name || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push({ ...property, name } as T)
  }
  return unique.sort((left, right) => left.name.localeCompare(right.name))
}
