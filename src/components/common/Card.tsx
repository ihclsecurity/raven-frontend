/**
 * Raven Card Primitive
 *
 * A small layout primitive for premium command-centre surfaces. It is
 * intentionally visual-only so product pages can adopt it without changing
 * data flow or behavior.
 */
import type { ReactNode } from 'react'

type CardTone = 'default' | 'accent' | 'success' | 'warning' | 'danger'
type CardDensity = 'comfortable' | 'compact'

interface CardProps {
  title?: string
  eyebrow?: string
  description?: string
  actions?: ReactNode
  tone?: CardTone
  density?: CardDensity
  className?: string
  children?: ReactNode
}

export function Card({
  title,
  eyebrow,
  description,
  actions,
  tone = 'default',
  density = 'comfortable',
  className = '',
  children,
}: CardProps) {
  const classes = [
    'raven-card',
    `raven-card--${tone}`,
    `raven-card--${density}`,
    className,
  ].filter(Boolean).join(' ')

  return (
    <section className={classes}>
      {eyebrow || title || description || actions ? (
        <header className="raven-card-header">
          <div className="raven-card-copy">
            {eyebrow ? <span className="raven-eyebrow">{eyebrow}</span> : null}
            {title ? <h2 className="raven-card-title">{title}</h2> : null}
            {description ? <p className="raven-card-description">{description}</p> : null}
          </div>
          {actions ? <div className="raven-card-actions">{actions}</div> : null}
        </header>
      ) : null}
      {children ? <div className="raven-card-body">{children}</div> : null}
    </section>
  )
}
