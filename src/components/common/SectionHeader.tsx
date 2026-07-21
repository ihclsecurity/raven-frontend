/**
 * Raven Section Header Primitive
 *
 * Provides consistent section hierarchy for cards, tables, maps, and forms.
 */
import type { ReactNode } from 'react'

interface SectionHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className = '',
}: SectionHeaderProps) {
  return (
    <header className={`raven-section-header${className ? ` ${className}` : ''}`}>
      <div>
        {eyebrow ? <span className="raven-eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="raven-section-header-actions">{actions}</div> : null}
    </header>
  )
}
