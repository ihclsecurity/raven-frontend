/**
 * Stat Card
 *
 * This component renders the lightweight statistic tiles used across summary
 * sections and operational dashboards.
 *
 * It is responsible for:
 * - presenting a label, value, and optional hint together
 * - applying the requested tone consistently
 *
 * What this file does not do:
 * - it does not load the statistic value
 * - it does not define the surrounding page layout
 */
type StatCardTone = 'default' | 'info' | 'success' | 'warning' | 'critical'

interface StatCardProps {
  label: string
  value: string | number
  hint?: string
  tone?: StatCardTone
  className?: string
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  className = '',
}: StatCardProps) {
  const classes = `ui-stat-card ui-stat-card--${tone}${className ? ` ${className}` : ''}`
  return (
    <article className={classes}>
      <span className="ui-stat-label">{label}</span>
      <strong className="ui-stat-value">{value}</strong>
      {hint ? <span className="ui-stat-hint">{hint}</span> : null}
    </article>
  )
}
