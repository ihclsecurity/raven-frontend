/**
 * Module: RiskCategoryTreemap
 * Purpose: Treemap visualization for dashboard risk category distribution.
 * Context: Keep this component focused on category rendering and selection.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { FilterableAlertCategoryKey } from '../../constants/taxonomy'

type TreemapItem = {
  key: FilterableAlertCategoryKey
  label: string
  color: string
  count: number
}

type TreemapRect = {
  item: TreemapItem
  x: number
  y: number
  width: number
  height: number
}

type HoverTooltipState = {
  left: number
  top: number
  item: TreemapItem
  percentage: number
}

type RiskCategoryTreemapProps = {
  items: TreemapItem[]
  selectedCategory: FilterableAlertCategoryKey | null
  onSelectCategory: (category: FilterableAlertCategoryKey | null) => void
}

type ThemeMode = 'light' | 'dark'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function mixChannel(base: number, target: number, ratio: number): number {
  return Math.round(base + (target - base) * ratio)
}

function normalizeHex(color: string): string {
  const raw = String(color || '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`
  }
  return '#64748b'
}

function tintColor(color: string, ratio: number): string {
  const hex = normalizeHex(color).slice(1)
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const safeRatio = clamp(ratio, 0, 1)
  const nr = mixChannel(r, 255, safeRatio)
  const ng = mixChannel(g, 255, safeRatio)
  const nb = mixChannel(b, 255, safeRatio)
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`
}

function shadeColor(color: string, ratio: number): string {
  const hex = normalizeHex(color).slice(1)
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const safeRatio = clamp(ratio, 0, 1)
  const nr = mixChannel(r, 0, safeRatio)
  const ng = mixChannel(g, 0, safeRatio)
  const nb = mixChannel(b, 0, safeRatio)
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`
}

function splitBalanced(items: TreemapItem[]): [TreemapItem[], TreemapItem[]] {
  if (items.length <= 1) return [items, []]
  const total = items.reduce((sum, item) => sum + item.count, 0)
  const half = total / 2
  let running = 0
  let bestIndex = 1
  let bestDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < items.length - 1; i += 1) {
    running += items[i].count
    const distance = Math.abs(half - running)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = i + 1
    }
  }
  return [items.slice(0, bestIndex), items.slice(bestIndex)]
}

function layoutTreemap(
  items: TreemapItem[],
  x: number,
  y: number,
  width: number,
  height: number,
  gap: number,
): TreemapRect[] {
  if (!items.length || width <= 0 || height <= 0) return []
  if (items.length === 1) {
    return [{ item: items[0], x, y, width, height }]
  }

  const [groupA, groupB] = splitBalanced(items)
  const total = items.reduce((sum, item) => sum + item.count, 0)
  const totalA = groupA.reduce((sum, item) => sum + item.count, 0)
  const ratioA = total > 0 ? totalA / total : 0.5

  if (width >= height) {
    const splitWidth = Math.max(0, Math.round(width * ratioA))
    const leftWidth = Math.max(0, splitWidth - gap / 2)
    const rightWidth = Math.max(0, width - splitWidth - gap / 2)
    return [
      ...layoutTreemap(groupA, x, y, leftWidth, height, gap),
      ...layoutTreemap(groupB, x + splitWidth + gap / 2, y, rightWidth, height, gap),
    ]
  }

  const splitHeight = Math.max(0, Math.round(height * ratioA))
  const topHeight = Math.max(0, splitHeight - gap / 2)
  const bottomHeight = Math.max(0, height - splitHeight - gap / 2)
  return [
    ...layoutTreemap(groupA, x, y, width, topHeight, gap),
    ...layoutTreemap(groupB, x, y + splitHeight + gap / 2, width, bottomHeight, gap),
  ]
}

export function RiskCategoryTreemap({
  items,
  selectedCategory,
  onSelectCategory,
}: RiskCategoryTreemapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltipState | null>(null)
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

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setSize({
        width: Math.max(0, Math.floor(entry.contentRect.width)),
        height: Math.max(0, Math.floor(entry.contentRect.height)),
      })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const nonZeroItems = useMemo(
    () => items.filter((item) => item.count > 0).sort((a, b) => b.count - a.count),
    [items],
  )

  const rects = useMemo(() => {
    if (!size.width || !size.height || !nonZeroItems.length) return []
    return layoutTreemap(nonZeroItems, 0, 0, size.width, size.height, 8)
  }, [nonZeroItems, size.height, size.width])
  const totalCount = useMemo(
    () => items.reduce((sum, item) => sum + Math.max(0, item.count), 0),
    [items],
  )
  const isLightTheme = themeMode === 'light'

  return (
    <div className="dashboard-risk-treemap-wrap">
      <div ref={containerRef} className="dashboard-risk-treemap">
        {rects.map((rect) => {
          const isSelected = selectedCategory === rect.item.key
          const isCompact = rect.width < 160 || rect.height < 84
          const isTiny = rect.width < 118 || rect.height < 60
          const percentage = totalCount > 0 ? (rect.item.count / totalCount) * 100 : 0
          const widthScale = clamp(rect.width / 168, 0.84, 1.52)
          const heightScale = clamp(rect.height / 108, 0.76, 1.36)
          const labelScale = clamp(Math.min(widthScale * 1.08, Math.max(0.92, heightScale * 1.18)), 0.94, 1.42)
          const countScale = clamp(Math.min(rect.width / 122, rect.height / 84), 0.72, 1.42)
          const labelSize = clamp(12 * labelScale, 11, 17)
          const countSize = clamp(23 * countScale, 15, 34)
          const tilePadY = clamp(Math.min(rect.height / 8.2, rect.width / 12.5), 6, 14)
          const tilePadX = clamp(rect.width / 12.5, 7, 16)
          const labelLines = rect.width < 136 ? 3 : rect.height < 88 ? 2 : 3
          const bright = isLightTheme ? tintColor(rect.item.color, 0.78) : tintColor(rect.item.color, 0.07)
          const mid = isLightTheme ? tintColor(rect.item.color, 0.6) : shadeColor(rect.item.color, 0.18)
          const deep = isLightTheme ? tintColor(rect.item.color, 0.43) : shadeColor(rect.item.color, 0.34)
          const sheen = isLightTheme
            ? 'radial-gradient(130% 85% at 8% 6%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.12) 44%, rgba(255,255,255,0) 72%)'
            : 'radial-gradient(130% 85% at 8% 6%, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 42%)'
          const tileClass = `dashboard-risk-tile${isSelected ? ' is-selected' : ''}${isTiny ? ' is-tiny' : isCompact ? ' is-compact' : ''}`
          const tileStyle: CSSProperties = {
            left: `${rect.x}px`,
            top: `${rect.y}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            background: `${sheen}, linear-gradient(158deg, ${bright} 0%, ${mid} 52%, ${deep} 100%)`,
            borderColor: isLightTheme ? tintColor(rect.item.color, 0.22) : undefined,
            ['--tile-label-size' as string]: `${labelSize}px`,
            ['--tile-count-size' as string]: `${countSize}px`,
            ['--tile-pad-y' as string]: `${tilePadY}px`,
            ['--tile-pad-x' as string]: `${tilePadX}px`,
            ['--tile-label-lines' as string]: `${labelLines}`,
          }
          return (
            <button
              key={rect.item.key}
              type="button"
              className={tileClass}
              onClick={() => onSelectCategory(isSelected ? null : rect.item.key)}
              onMouseEnter={(event) => {
                const node = containerRef.current
                if (!node) return
                const bounds = node.getBoundingClientRect()
                setHoverTooltip({
                  left: event.clientX - bounds.left + 12,
                  top: event.clientY - bounds.top + 12,
                  item: rect.item,
                  percentage,
                })
              }}
              onMouseMove={(event) => {
                const node = containerRef.current
                if (!node) return
                const bounds = node.getBoundingClientRect()
                setHoverTooltip((current) => {
                  if (!current || current.item.key !== rect.item.key) return current
                  return {
                    ...current,
                    left: event.clientX - bounds.left + 12,
                    top: event.clientY - bounds.top + 12,
                  }
                })
              }}
              onMouseLeave={() => setHoverTooltip((current) => (current?.item.key === rect.item.key ? null : current))}
              onBlur={() => setHoverTooltip((current) => (current?.item.key === rect.item.key ? null : current))}
              style={tileStyle}
              aria-label={`${rect.item.label}: ${rect.item.count} alerts (${percentage.toFixed(1)}%). Click to filter.`}
            >
              <span className="dashboard-risk-tile-label">{rect.item.label}</span>
              <strong className="dashboard-risk-tile-count">{rect.item.count}</strong>
            </button>
          )
        })}
        {hoverTooltip ? (
          <div
            className="dashboard-risk-tooltip"
            style={{
              left: `${Math.min(hoverTooltip.left, Math.max(12, size.width - 236))}px`,
              top: `${Math.min(hoverTooltip.top, Math.max(12, size.height - 128))}px`,
            }}
          >
            <div className="dashboard-risk-tooltip-title">{hoverTooltip.item.label}</div>
            <div className="dashboard-risk-tooltip-meta">
              <span>Alerts</span>
              <strong>{hoverTooltip.item.count}</strong>
            </div>
            <div className="dashboard-risk-tooltip-meta">
              <span>Share</span>
              <strong>{hoverTooltip.percentage.toFixed(1)}%</strong>
            </div>
            <div className="dashboard-risk-tooltip-hint">Click to filter</div>
          </div>
        ) : null}
      </div>
      {!nonZeroItems.length ? <div className="dashboard-empty">No high-impact category data in this window.</div> : null}
    </div>
  )
}
