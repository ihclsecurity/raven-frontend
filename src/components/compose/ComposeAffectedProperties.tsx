/**
 * Module: ComposeAffectedProperties
 * Purpose: Shows impacted property context for advisory composition.
 * Context: Keeps property impact parsing close to the Compose analysis workflow.
 */

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { datasurfrApi } from '../../api/datasurfr'
import type { DatasurfrMapProperty } from '../../types/datasurfr'

interface ComposeAffectedPropertiesProps {
  fields: Record<string, unknown>
  notificationId: number | null
  onTagsChange: (nextTagsJson: string) => void
  className?: string
}

function normalizePropertyName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function ComposeAffectedProperties({ fields, notificationId, onTagsChange, className }: ComposeAffectedPropertiesProps) {
  const [showAllAffectedProperties, setShowAllAffectedProperties] = useState(false)
  const [manualPropertyQuery, setManualPropertyQuery] = useState('')
  const [isAddPropertyOpen, setIsAddPropertyOpen] = useState(false)

  const parsedTags = useMemo(() => {
    const raw = fields.tags_json
    if (!raw) {
      return null
    }
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
      } catch {
        return null
      }
    }
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  }, [fields.tags_json])

  const extractedAffectedProperties = useMemo(() => {
    const fromAllTags = Array.isArray(parsedTags?.impacted_properties_all)
      ? parsedTags.impacted_properties_all
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      : []
    if (fromAllTags.length) {
      return Array.from(new Set(fromAllTags))
    }

    const fromPreviewTags = Array.isArray(parsedTags?.impacted_properties_preview)
      ? parsedTags.impacted_properties_preview
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      : []
    if (fromPreviewTags.length) {
      return Array.from(new Set(fromPreviewTags))
    }

    const source = String(fields.source_text || '')
    if (!source.trim()) {
      return []
    }
    const lines = source.split(/\r?\n/)
    const previewMarkerIndex = lines.findIndex((line) =>
      /^Potentially Affected Properties Preview\b/i.test(line.trim()),
    )
    const countMarkerIndex = lines.findIndex((line) =>
      /^Potentially Affected Properties\b/i.test(line.trim()),
    )
    const markerIndex = previewMarkerIndex !== -1 ? previewMarkerIndex : countMarkerIndex
    if (markerIndex === -1) {
      return []
    }

    const items: string[] = []
    for (let index = markerIndex + 1; index < lines.length; index += 1) {
      const line = lines[index].trim()
      if (!line) {
        if (items.length > 0) break
        continue
      }
      if (/^Potentially Affected Properties Preview\b/i.test(line)) {
        continue
      }
      if (/^[A-Za-z][A-Za-z\s]+:\s*/.test(line)) {
        break
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const value = line.slice(2).trim()
        if (value) {
          items.push(value)
        }
      } else if (items.length > 0) {
        break
      }
    }

    return Array.from(new Set(items))
  }, [parsedTags, fields.source_text])

  const [selectedAffectedProperties, setSelectedAffectedProperties] = useState<string[]>([])

  const extractedSignature = useMemo(
    () => extractedAffectedProperties.map((item) => normalizePropertyName(item)).join('|'),
    [extractedAffectedProperties],
  )

  useEffect(() => {
    setSelectedAffectedProperties(extractedAffectedProperties)
  }, [notificationId, extractedSignature, extractedAffectedProperties])

  const selectedPropertyKeys = useMemo(
    () => new Set(selectedAffectedProperties.map((item) => normalizePropertyName(item))),
    [selectedAffectedProperties],
  )

  const { data: mapProperties = [] } = useQuery({
    queryKey: ['map-view-properties'],
    queryFn: () => datasurfrApi.listMapProperties(),
    staleTime: 5 * 60 * 1000,
  })

  const availablePropertyNames = useMemo(() => {
    const seen = new Set<string>()
    const names: string[] = []
    for (const property of mapProperties) {
      const name = String(property.property_name || '').trim()
      if (!name) continue
      const key = normalizePropertyName(name)
      if (seen.has(key)) continue
      seen.add(key)
      names.push(name)
    }
    return names.sort((left, right) => left.localeCompare(right))
  }, [mapProperties])

  const mapPropertyByName = useMemo(() => {
    const byName = new Map<string, DatasurfrMapProperty>()
    for (const property of mapProperties) {
      const name = String(property.property_name || '').trim()
      if (!name) continue
      const key = normalizePropertyName(name)
      if (!byName.has(key)) {
        byName.set(key, property)
      }
    }
    return byName
  }, [mapProperties])

  const filteredPropertyOptions = useMemo(() => {
    const query = manualPropertyQuery.trim().toLowerCase()
    const candidates = availablePropertyNames
      .filter((name) => !selectedPropertyKeys.has(normalizePropertyName(name)))
    if (!query) return candidates.slice(0, 8)
    return candidates
      .filter((name) => name.toLowerCase().includes(query))
      .slice(0, 8)
  }, [availablePropertyNames, manualPropertyQuery, selectedPropertyKeys])

  const canAddManualProperty = useMemo(() => {
    const name = manualPropertyQuery.trim()
    if (!name) return false
    return !selectedPropertyKeys.has(normalizePropertyName(name))
  }, [manualPropertyQuery, selectedPropertyKeys])

  const persistSelectedProperties = (next: string[]) => {
    const nextTags: Record<string, unknown> = parsedTags ? { ...parsedTags } : {}
    const nextPoints = next
      .map((name) => mapPropertyByName.get(normalizePropertyName(name)))
      .filter((property): property is DatasurfrMapProperty => Boolean(property))
      .map((property) => ({
        name: property.property_name,
        brand: property.brand,
        latitude: property.latitude,
        longitude: property.longitude,
        region: property.region,
        state: property.state,
        country: property.country,
      }))
    nextTags.impacted_properties_all = next
    nextTags.impacted_properties_preview = next.slice(0, 20)
    nextTags.impacted_properties_points = nextPoints
    nextTags.impacted_property_count = next.length
    onTagsChange(JSON.stringify(nextTags))
  }

  const addAffectedProperty = (value: string) => {
    const name = value.trim()
    if (!name) return
    if (selectedPropertyKeys.has(normalizePropertyName(name))) {
      setManualPropertyQuery('')
      return
    }
    const next = [...selectedAffectedProperties, name]
    setSelectedAffectedProperties(next)
    persistSelectedProperties(next)
    setManualPropertyQuery('')
    setIsAddPropertyOpen(false)
  }

  const removeAffectedProperty = (value: string) => {
    const key = normalizePropertyName(value)
    const next = selectedAffectedProperties.filter((item) => normalizePropertyName(item) !== key)
    setSelectedAffectedProperties(next)
    persistSelectedProperties(next)
  }

  const hasMoreAffectedProperties = selectedAffectedProperties.length > 20
  const visibleAffectedProperties = useMemo(
    () => (showAllAffectedProperties ? selectedAffectedProperties : selectedAffectedProperties.slice(0, 20)),
    [selectedAffectedProperties, showAllAffectedProperties],
  )

  const totalImpactedPropertyCount = useMemo(() => {
    const tagValue = parsedTags?.impacted_property_count
    if (typeof tagValue === 'number' && Number.isFinite(tagValue) && tagValue >= 0) {
      return Math.trunc(tagValue)
    }
    if (typeof tagValue === 'string') {
      const parsed = Number.parseInt(tagValue, 10)
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed
      }
    }
    const source = String(fields.source_text || '')
    const match = source.match(/Potentially Affected Properties\s*\(showing\s+\d+\s+of\s+(\d+)\)/i)
    if (match && match[1]) {
      const parsed = Number.parseInt(match[1], 10)
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed
      }
    }
    const directMatch = source.match(/Potentially Affected Properties\s*:\s*(\d+)/i)
    if (directMatch && directMatch[1]) {
      const parsed = Number.parseInt(directMatch[1], 10)
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed
      }
    }
    return null
  }, [parsedTags, fields.source_text])

  const affectedPropertiesSummary = useMemo(() => {
    if (selectedAffectedProperties.length > 0) {
      return `${selectedAffectedProperties.length} selected`
    }
    if (totalImpactedPropertyCount !== null) {
      return `${totalImpactedPropertyCount} mapped`
    }
    return 'Not mapped yet'
  }, [selectedAffectedProperties.length, totalImpactedPropertyCount])

  useEffect(() => {
    setShowAllAffectedProperties(false)
  }, [notificationId, selectedAffectedProperties.length])

  useEffect(() => {
    setIsAddPropertyOpen(false)
    setManualPropertyQuery('')
  }, [notificationId])

  const closeAddPropertyPopup = () => {
    setIsAddPropertyOpen(false)
    setManualPropertyQuery('')
  }

  return (
    <div className={`affected-properties-panel compose-impact-panel${className ? ` ${className}` : ''}`}>
      <div className="affected-properties-header">
        <div>
          <h2 className="affected-properties-title">Properties Affected</h2>
        </div>
        <div className="affected-properties-header-actions">
          <div className="affected-properties-count">{affectedPropertiesSummary}</div>
          {hasMoreAffectedProperties ? (
            <button
              type="button"
              className="datasurfr-impact-toggle"
              onClick={() => setShowAllAffectedProperties((prev) => !prev)}
            >
              {showAllAffectedProperties ? 'Show less' : `View all (${selectedAffectedProperties.length})`}
            </button>
          ) : null}
        </div>
      </div>

      <div className="compose-impact-actions">
        <button
          type="button"
          className="btn-secondary compose-impact-add-trigger"
          onClick={() => setIsAddPropertyOpen(true)}
        >
          + Add property
        </button>
      </div>

      {isAddPropertyOpen ? (
        <div
          className="compose-impact-popup-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeAddPropertyPopup()
            }
          }}
        >
          <div className="compose-impact-popup" role="dialog" aria-modal="true" aria-label="Add property">
            <div className="compose-impact-popup-head">
              <span>Add property</span>
              <button type="button" className="compose-impact-popup-close" onClick={closeAddPropertyPopup}>
                Close
              </button>
            </div>

            <div className="compose-impact-popup-body">
              <div className="compose-impact-popup-search">
                <input
                  autoFocus
                  value={manualPropertyQuery}
                  onChange={(event) => setManualPropertyQuery(event.target.value)}
                  placeholder="Search and add property"
                  aria-label="Search and add property"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addAffectedProperty(manualPropertyQuery)
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      closeAddPropertyPopup()
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-secondary compose-impact-add-button"
                  onClick={() => addAffectedProperty(manualPropertyQuery)}
                  disabled={!canAddManualProperty}
                >
                  Add
                </button>
              </div>

              {filteredPropertyOptions.length ? (
                <div className="compose-impact-suggestions compose-impact-suggestions--popup">
                  {filteredPropertyOptions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="compose-impact-suggestion"
                      onClick={() => addAffectedProperty(name)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="compose-impact-popup-empty">No matching properties found.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {visibleAffectedProperties.length ? (
        <ul className="affected-properties-list">
          {visibleAffectedProperties.map((name) => (
            <li key={name} className="affected-property-chip">
              <span>{name}</span>
              <button
                type="button"
                className="affected-property-remove"
                onClick={() => removeAffectedProperty(name)}
                aria-label={`Remove ${name}`}
              >
                x
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="compose-meta-note">
          Import Datasurfr intelligence to populate mapped impacted properties here.
        </div>
      )}
    </div>
  )
}
