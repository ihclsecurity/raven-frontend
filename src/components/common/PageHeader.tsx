/**
 * Raven Page Header Primitive
 *
 * Standardizes page-level hierarchy for intelligence screens without owning
 * any page state, routing, or API behavior.
 */
import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <header className={`raven-page-header${className ? ` ${className}` : ''}`}>
      <div className="raven-page-header-copy">
        {eyebrow ? <span className="raven-eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {meta ? <div className="raven-page-header-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="raven-page-header-actions">{actions}</div> : null}
    </header>
  )
}
