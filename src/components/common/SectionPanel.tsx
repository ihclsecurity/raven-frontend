/**
 * Section Panel
 *
 * This is the standard boxed container used across the app for grouped content.
 *
 * It is responsible for:
 * - rendering a section title, subtitle, and action area when provided
 * - applying the requested tone so panels feel consistent
 * - keeping page layouts aligned to the shared design system
 *
 * What this file does not do:
 * - it does not decide what content belongs in the panel
 * - it does not fetch or transform data
 */
import type { ReactNode } from 'react'

type SectionPanelTone = 'default' | 'info' | 'success' | 'warning' | 'critical'

interface SectionPanelProps {
  title?: string
  subtitle?: string
  actions?: ReactNode
  tone?: SectionPanelTone
  className?: string
  children: ReactNode
}

export function SectionPanel({
  title,
  subtitle,
  actions,
  tone = 'default',
  className = '',
  children,
}: SectionPanelProps) {
  const classes = `ui-panel ui-panel--${tone}${className ? ` ${className}` : ''}`
  return (
    <section className={classes}>
      {title || subtitle || actions ? (
        <header className="ui-panel-head">
          <div className="ui-panel-head-copy">
            {title ? <h3>{title}</h3> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className="ui-panel-head-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="ui-panel-body">{children}</div>
    </section>
  )
}
