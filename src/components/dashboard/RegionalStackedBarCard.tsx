/**
 * Module: RegionalStackedBarCard
 * Purpose: Show regional risk distribution using horizontal stacked bars.
 * Context: Replaces the grid heatmap in the Regional Heatboard panel.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ALERT_CATEGORY_ORDER, categorizeAlert, type FilterableAlertCategoryKey } from '../../constants/taxonomy'
import type { DatasurfrAlert } from '../../types/datasurfr'
import { MetricInfoHint } from '../common/MetricInfoHint'

type RegionalCellKey = {
  region: string
  category: FilterableAlertCategoryKey
}

type RegionalStackedBarCardProps = {
  alerts: DatasurfrAlert[]
  selectedCell: RegionalCellKey | null
  onSelectCell: (cell: RegionalCellKey | null) => void
  onOpenFeed: () => void
}

type TooltipState = {
  left: number
  top: number
  region: string
  categoryLabel: string
  count: number
  share: number
}

type ThemeMode = 'light' | 'dark'

function normalizeHex(color: string): string {
  const raw = String(color || '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`
  }
  return '#64748b'
}

function mixChannel(base: number, target: number, ratio: number): number {
  return Math.round(base + (target - base) * ratio)
}

function tintColor(color: string, ratio: number): string {
  const hex = normalizeHex(color).slice(1)
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const nr = mixChannel(r, 255, Math.max(0, Math.min(1, ratio)))
  const ng = mixChannel(g, 255, Math.max(0, Math.min(1, ratio)))
  const nb = mixChannel(b, 255, Math.max(0, Math.min(1, ratio)))
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`
}

function shadeColor(color: string, ratio: number): string {
  const hex = normalizeHex(color).slice(1)
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const nr = mixChannel(r, 0, Math.max(0, Math.min(1, ratio)))
  const ng = mixChannel(g, 0, Math.max(0, Math.min(1, ratio)))
  const nb = mixChannel(b, 0, Math.max(0, Math.min(1, ratio)))
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`
}

function buildSegmentGradient(baseColor: string, themeMode: ThemeMode): string {
  if (themeMode === 'light') {
    const bright = tintColor(baseColor, 0.6)
    const mid = tintColor(baseColor, 0.34)
    const deep = tintColor(baseColor, 0.12)
    return `linear-gradient(to bottom right, ${bright} 0%, ${mid} 46%, ${deep} 100%)`
  }

  const bright = tintColor(baseColor, 0.42)
  const mid = tintColor(baseColor, 0.1)
  const deep = shadeColor(baseColor, 0.34)
  return `linear-gradient(to bottom right, ${bright} 0%, ${mid} 42%, ${deep} 100%)`
}

const CATEGORY_SET: Array<{ key: FilterableAlertCategoryKey; shortLabel: string; label: string; color: string }> = [
  {
    key: 'security_threats',
    shortLabel: 'Terror',
    label: 'Terror / Threat',
    color: ALERT_CATEGORY_ORDER.find((c) => c.key === 'security_threats')?.color || '#dc2626',
  },
  {
    key: 'civil_unrest',
    shortLabel: 'Civil',
    label: 'Civil Unrest',
    color: ALERT_CATEGORY_ORDER.find((c) => c.key === 'civil_unrest')?.color || '#b45309',
  },
  {
    key: 'crime_law',
    shortLabel: 'Crime',
    label: 'Crime & Law',
    color: ALERT_CATEGORY_ORDER.find((c) => c.key === 'crime_law')?.color || '#7c3aed',
  },
  {
    key: 'travel_disruption',
    shortLabel: 'Travel',
    label: 'Travel Disruption',
    color: ALERT_CATEGORY_ORDER.find((c) => c.key === 'travel_disruption')?.color || '#2563eb',
  },
  {
    key: 'critical_infrastructure',
    shortLabel: 'Infra',
    label: 'Critical Infrastructure',
    color: ALERT_CATEGORY_ORDER.find((c) => c.key === 'critical_infrastructure')?.color || '#0f766e',
  },
  {
    key: 'weather_disruption',
    shortLabel: 'Weather',
    label: 'Weather Disruption',
    color: ALERT_CATEGORY_ORDER.find((c) => c.key === 'weather_disruption')?.color || '#0369a1',
  },
]

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

export function RegionalStackedBarCard({
  alerts,
  selectedCell,
  onSelectCell,
  onOpenFeed,
}: RegionalStackedBarCardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof document === 'undefined') return 'light'
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const root = document.documentElement
    const readTheme = (): ThemeMode => (root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light')
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

  const rows = useMemo(() => {
    const byRegion = new Map<
      string,
      {
        total: number
        sumImpact: number
        byCategory: Record<FilterableAlertCategoryKey, number>
      }
    >()

    for (const alert of alerts) {
      const category = categorizeAlert(alert)
      if (!CATEGORY_SET.some((item) => item.key === category)) continue
      const mappedRegions = uniqueStrings(alert.mapped_regions || [])
      const regions = mappedRegions.length ? mappedRegions : ['Needs Mapping']
      for (const region of regions) {
        const current = byRegion.get(region) || {
          total: 0,
          sumImpact: 0,
          byCategory: {
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
          } as Record<FilterableAlertCategoryKey, number>,
        }
        current.total += 1
        current.sumImpact += alert.hotel_impact_score || 0
        current.byCategory[category] = (current.byCategory[category] || 0) + 1
        byRegion.set(region, current)
      }
    }

    return Array.from(byRegion.entries())
      .map(([region, value]) => ({
        region,
        total: value.total,
        avgImpact: value.total > 0 ? value.sumImpact / value.total : 0,
        byCategory: value.byCategory,
      }))
      .sort((a, b) => b.total - a.total)
  }, [alerts])

  return (
    <article className="dashboard-panel dashboard-panel--slate dashboard-regional-stacked-card">
      <div className="dashboard-panel-head">
        <h3>Regional Alert Stack</h3>
        <MetricInfoHint text="Compares regions by total alert load and internal category composition. Each row is a region; each segment represents a risk category share within that region. Wider segments indicate category concentration, helping identify where specific risk types are clustering geographically." />
        <button type="button" className="btn-ghost" onClick={onOpenFeed}>
          Open Feed
        </button>
      </div>

      <div className="dashboard-regional-stacked-wrap" ref={containerRef}>
        {rows.map((row) => {
          return (
            <div key={row.region} className="dashboard-regional-row">
              <div className="dashboard-regional-name" title={row.region}>
                {row.region}
              </div>

              <div className="dashboard-regional-bar">
                {CATEGORY_SET.map((category) => {
                  const count = row.byCategory[category.key] || 0
                  if (!count || !row.total) return null
                  const widthPct = (count / row.total) * 100
                  const sharePct = Math.round((count / row.total) * 1000) / 10
                  const isSelected =
                    selectedCell?.region === row.region && selectedCell?.category === category.key
                  return (
                    <button
                      key={`${row.region}-${category.key}`}
                      type="button"
                      className={`dashboard-regional-segment${isSelected ? ' is-active' : ''}`}
                      style={{
                        width: `${widthPct}%`,
                        background: buildSegmentGradient(category.color, themeMode),
                        borderColor: themeMode === 'light' ? 'rgba(255, 255, 255, 0.72)' : undefined,
                      }}
                      onClick={() =>
                        onSelectCell(
                          isSelected ? null : { region: row.region, category: category.key },
                        )
                      }
                      onMouseEnter={(event) => {
                        const node = containerRef.current
                        if (!node) return
                        const bounds = node.getBoundingClientRect()
                        setTooltip({
                          left: event.clientX - bounds.left + 10,
                          top: event.clientY - bounds.top + 10,
                          region: row.region,
                          categoryLabel: category.label,
                          count,
                          share: sharePct,
                        })
                      }}
                      onMouseMove={(event) => {
                        const node = containerRef.current
                        if (!node) return
                        const bounds = node.getBoundingClientRect()
                        setTooltip((current) => {
                          if (!current) return current
                          return {
                            ...current,
                            left: event.clientX - bounds.left + 10,
                            top: event.clientY - bounds.top + 10,
                          }
                        })
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      aria-label={`${row.region}, ${category.label}: ${count} alerts (${sharePct}%)`}
                      title={`${category.shortLabel}: ${count}`}
                    />
                  )
                })}
              </div>

              <div className="dashboard-regional-metrics">
                <strong>{row.total}</strong>
              </div>
            </div>
          )
        })}

        <div className="dashboard-regional-legend">
          {CATEGORY_SET.map((category) => (
            <span key={category.key} className="dashboard-regional-legend-item">
              <span
                className="dashboard-regional-legend-dot"
                style={{ background: category.color }}
              />
              {category.shortLabel}
            </span>
          ))}
        </div>

        {tooltip ? (
          <div
            className="dashboard-regional-tooltip"
            style={{ left: `${Math.min(tooltip.left, 780)}px`, top: `${Math.max(8, tooltip.top)}px` }}
          >
            <div className="dashboard-regional-tooltip-row">
              <span>Region</span>
              <strong>{tooltip.region}</strong>
            </div>
            <div className="dashboard-regional-tooltip-row">
              <span>Category</span>
              <strong>{tooltip.categoryLabel}</strong>
            </div>
            <div className="dashboard-regional-tooltip-row">
              <span>Alert count</span>
              <strong>{tooltip.count}</strong>
            </div>
            <div className="dashboard-regional-tooltip-row">
              <span>Share in region</span>
              <strong>{tooltip.share}%</strong>
            </div>
          </div>
        ) : null}
      </div>

      {!rows.length ? <div className="dashboard-empty">No region mapping data in this window.</div> : null}
    </article>
  )
}
