/**
 * Raven Tabs Primitive
 *
 * Presentation-only segmented navigation for page-local tabs and filters.
 */
import type { ReactNode } from 'react'

export interface RavenTabItem {
  key: string
  label: ReactNode
  count?: number
  disabled?: boolean
}

interface TabsProps {
  items: RavenTabItem[]
  activeKey: string
  onChange: (key: string) => void
  ariaLabel: string
  className?: string
}

export function Tabs({ items, activeKey, onChange, ariaLabel, className = '' }: TabsProps) {
  return (
    <div className={`raven-tabs${className ? ` ${className}` : ''}`} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          className={`raven-tab${item.key === activeKey ? ' is-active' : ''}`}
          aria-selected={item.key === activeKey}
          disabled={item.disabled}
          onClick={() => onChange(item.key)}
        >
          <span>{item.label}</span>
          {typeof item.count === 'number' ? <strong>{item.count}</strong> : null}
        </button>
      ))}
    </div>
  )
}
