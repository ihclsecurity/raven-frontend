/**
 * Module: RegionalHeatmapCard
 * Purpose: Render regional risk distribution as a matrix heatmap.
 * Context: Used by dashboard Regional Heatboard section.
 */

import { useMemo, useRef, useState } from 'react'
import { ALERT_CATEGORY_ORDER, categorizeAlert, type FilterableAlertCategoryKey } from '../../constants/taxonomy'
import type { DatasurfrAlert } from '../../types/datasurfr'

type HeatmapCellKey = {
  region: string
  category: FilterableAlertCategoryKey
}

type RegionalHeatmapCardProps = {
  alerts: DatasurfrAlert[]
  selectedCell: HeatmapCellKey | null
  onSelectCell: (cell: HeatmapCellKey | null) => void
  onOpenFeed: () => void
}

type TooltipState = {
  left: number
  top: number
  region: string
  categoryLabel: string
  count: number
  avgImpact: number
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

function shortCategoryLabel(label: string): string {
  const text = String(label || '').trim()
  if (text === 'Terror / Threat') return 'Terror'
  if (text === 'Civil Unrest') return 'Civil'
  if (text === 'Crime & Law') return 'Crime'
  if (text === 'Travel Disruption') return 'Travel'
  if (text === 'Critical Infrastructure') return 'Infra'
  if (text === 'Weather Disruption') return 'Weather'
  if (text === 'Natural Disaster') return 'Natural'
  if (text === 'Public Health') return 'Health'
  if (text === 'Political & Governance') return 'Political'
  return text
}

function cellIntensityColor(intensity: number): string {
  const safe = Math.max(0, Math.min(1, intensity))
  const alpha = 0.14 + safe * 0.72
  return `rgba(96, 165, 250, ${alpha.toFixed(3)})`
}

export function RegionalHeatmapCard({
  alerts,
  selectedCell,
  onSelectCell,
  onOpenFeed,
}: RegionalHeatmapCardProps) {
  const heatmapRef = useRef<HTMLDivElement | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const matrix = useMemo(() => {
    const byRegion = new Map<string, Map<FilterableAlertCategoryKey, { count: number; sumImpact: number }>>()

    for (const alert of alerts) {
      const category = categorizeAlert(alert)
      const regions = uniqueStrings(alert.mapped_regions || [])
      const scopedRegions = regions.length ? regions : ['Needs Mapping']
      for (const region of scopedRegions) {
        const row = byRegion.get(region) || new Map<FilterableAlertCategoryKey, { count: number; sumImpact: number }>()
        const current = row.get(category) || { count: 0, sumImpact: 0 }
        current.count += 1
        current.sumImpact += alert.hotel_impact_score || 0
        row.set(category, current)
        byRegion.set(region, row)
      }
    }

    const rows = Array.from(byRegion.entries())
      .map(([region, categories]) => {
        const total = Array.from(categories.values()).reduce((sum, item) => sum + item.count, 0)
        return { region, categories, total }
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

    const maxWeighted = Math.max(
      1,
      ...rows.flatMap((row) =>
        ALERT_CATEGORY_ORDER.map((category) => {
          const cell = row.categories.get(category.key)
          if (!cell || !cell.count) return 0
          const avgImpact = cell.sumImpact / cell.count
          return cell.count * Math.max(1, avgImpact)
        }),
      ),
    )

    return { rows, maxWeighted }
  }, [alerts])

  return (
    <article className="dashboard-panel dashboard-panel--slate dashboard-heatmap-panel">
      <div className="dashboard-panel-head">
        <h3>Regional Heatboard</h3>
        <button type="button" className="btn-ghost" onClick={onOpenFeed}>
          Open Feed
        </button>
      </div>

      <div className="dashboard-heatmap-wrap" ref={heatmapRef}>
        <div className="dashboard-heatmap-grid">
          <div className="dashboard-heatmap-corner">Region / Category</div>
          {ALERT_CATEGORY_ORDER.map((category) => (
            <div key={category.key} className="dashboard-heatmap-col-label" title={category.label}>
              {shortCategoryLabel(category.label)}
            </div>
          ))}

          {matrix.rows.map((row) => (
            <div key={row.region} className="dashboard-heatmap-row">
              <div className="dashboard-heatmap-row-label" title={row.region}>
                {row.region}
              </div>

              {ALERT_CATEGORY_ORDER.map((category) => {
                const cell = row.categories.get(category.key) || { count: 0, sumImpact: 0 }
                const avgImpact = cell.count ? cell.sumImpact / cell.count : 0
                const weighted = cell.count * Math.max(1, avgImpact)
                const intensity = matrix.maxWeighted ? weighted / matrix.maxWeighted : 0
                const isActive =
                  selectedCell?.region === row.region && selectedCell?.category === category.key
                return (
                  <button
                    key={`${row.region}-${category.key}`}
                    type="button"
                    className={`dashboard-heatmap-cell${isActive ? ' is-active' : ''}`}
                    style={{
                      background: `linear-gradient(180deg, ${cellIntensityColor(intensity)} 0%, rgba(15,23,42,0.18) 100%)`,
                      borderColor: intensity > 0.01 ? 'rgba(96, 165, 250, 0.44)' : 'rgba(51, 65, 85, 0.45)',
                    }}
                    onClick={() =>
                      onSelectCell(
                        isActive ? null : { region: row.region, category: category.key },
                      )
                    }
                    onMouseEnter={(event) => {
                      const node = heatmapRef.current
                      if (!node) return
                      const bounds = node.getBoundingClientRect()
                      setTooltip({
                        left: event.clientX - bounds.left + 10,
                        top: event.clientY - bounds.top + 10,
                        region: row.region,
                        categoryLabel: category.label,
                        count: cell.count,
                        avgImpact: avgImpact,
                      })
                    }}
                    onMouseMove={(event) => {
                      const node = heatmapRef.current
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
                    aria-label={`${row.region}, ${category.label}: ${cell.count} alerts, average impact ${avgImpact.toFixed(1)}`}
                  >
                    <span>{cell.count}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="dashboard-heatmap-legend">
          <span>Low intensity</span>
          <div className="dashboard-heatmap-legend-bar" />
          <span>High intensity</span>
        </div>

        {tooltip ? (
          <div
            className="dashboard-heatmap-tooltip"
            style={{
              left: `${Math.min(tooltip.left, 780)}px`,
              top: `${Math.max(8, tooltip.top)}px`,
            }}
          >
            <div className="dashboard-heatmap-tooltip-row">
              <span>Region</span>
              <strong>{tooltip.region}</strong>
            </div>
            <div className="dashboard-heatmap-tooltip-row">
              <span>Category</span>
              <strong>{tooltip.categoryLabel}</strong>
            </div>
            <div className="dashboard-heatmap-tooltip-row">
              <span>Alert count</span>
              <strong>{tooltip.count}</strong>
            </div>
            <div className="dashboard-heatmap-tooltip-row">
              <span>Avg impact</span>
              <strong>{tooltip.avgImpact.toFixed(1)}</strong>
            </div>
          </div>
        ) : null}
      </div>

      {matrix.rows.length === 0 ? <div className="dashboard-empty">No region mapping data in this window.</div> : null}
    </article>
  )
}

