/**
 * Dashboard KPI Card
 *
 * This component renders the compact dashboard metric tiles used on the main
 * operations screen.
 *
 * It is responsible for:
 * - presenting a label, value, subtitle, and sparkline together
 * - applying the correct tone for the metric's meaning
 * - supporting an optional click action when the card acts like a shortcut
 *
 * What this file does not do:
 * - it does not fetch metric values
 * - it does not decide what should be shown on the dashboard
 */
import type { LucideIcon } from 'lucide-react'

export type DashboardKpiTone =
  | 'priority'
  | 'priority-hot'
  | 'info'
  | 'success'
  | 'failed-calm'
  | 'failed-hot'

interface DashboardKpiCardProps {
  icon: LucideIcon
  label: string
  value: string
  subtitle: string
  insightLabel: string
  sparkline: number[]
  tone: DashboardKpiTone
  onClick?: () => void
  actionLabel?: string
}

function sparklinePath(points: number[], width: number, height: number, padding: number): string {
  const cleaned = points.length >= 2 ? points : [0, 0]
  const min = Math.min(...cleaned)
  const max = Math.max(...cleaned)
  const range = Math.max(1, max - min)
  const innerWidth = Math.max(1, width - padding * 2)
  const innerHeight = Math.max(1, height - padding * 2)

  return cleaned
    .map((point, index) => {
      const x = padding + (innerWidth * index) / Math.max(1, cleaned.length - 1)
      const y = padding + innerHeight - ((point - min) / range) * innerHeight
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

export function DashboardKpiCard({
  icon: Icon,
  label,
  value,
  subtitle,
  insightLabel,
  sparkline,
  tone,
  onClick,
  actionLabel,
}: DashboardKpiCardProps) {
  const width = 120
  const height = 28
  const path = sparklinePath(sparkline, width, height, 3)
  const content = (
    <>
      <div className="dashboard-kpi-card-v2-head">
        <div className="dashboard-kpi-card-v2-icon">
          <Icon size={15} />
        </div>
        <div className="dashboard-kpi-card-v2-label">{label}</div>
      </div>

      <div className="dashboard-kpi-card-v2-value">{value}</div>
      <div className="dashboard-kpi-card-v2-subtitle">{subtitle}</div>

      <div className="dashboard-kpi-card-v2-foot">
        <span className="dashboard-kpi-card-v2-insight">{insightLabel}</span>
        <svg className="dashboard-kpi-card-v2-sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          <path d={path} />
        </svg>
      </div>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className={`dashboard-kpi-card-v2 dashboard-kpi-card-v2--${tone} dashboard-kpi-card-v2--clickable`}
        onClick={onClick}
        aria-label={actionLabel || label}
      >
        {content}
      </button>
    )
  }

  return (
    <article className={`dashboard-kpi-card-v2 dashboard-kpi-card-v2--${tone}`}>
      {content}
    </article>
  )
}