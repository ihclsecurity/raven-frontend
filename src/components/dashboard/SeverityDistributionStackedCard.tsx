/**
 * Module: SeverityDistributionStackedCard
 * Purpose: Alternative severity card using a horizontal stacked bar.
 * Context: Used for side-by-side comparison against donut visualization.
 */

type SeverityDistributionStackedCardProps = {
  highCount: number
  mediumCount: number
  lowCount: number
  totalAlerts: number
  highExposureProperties: number
  mostImpactedRegion: string
  alertsWithin20Km: number
}

function pct(value: number, total: number): number {
  if (!total) return 0
  return Math.round((value / total) * 1000) / 10
}

export function SeverityDistributionStackedCard({
  highCount,
  mediumCount,
  lowCount,
  totalAlerts,
  highExposureProperties,
  mostImpactedRegion,
  alertsWithin20Km,
}: SeverityDistributionStackedCardProps) {
  const highPct = pct(highCount, totalAlerts)
  const mediumPct = pct(mediumCount, totalAlerts)
  const lowPct = pct(lowCount, totalAlerts)

  return (
    <article className="dashboard-panel dashboard-panel--indigo dashboard-severity-stacked-card">
      <div className="dashboard-panel-head dashboard-severity-stacked-head">
        <h3>Severity Distribution</h3>
        <div className="dashboard-severity-total">
          <strong>{totalAlerts}</strong>
          <span>Total alerts</span>
        </div>
      </div>

      <div className="dashboard-severity-stacked-wrap">
        <div className="dashboard-severity-stacked-bar" aria-label="Severity stacked distribution bar">
          <span
            className="dashboard-severity-segment dashboard-severity-segment--high"
            style={{ width: `${highPct}%` }}
          />
          <span
            className="dashboard-severity-segment dashboard-severity-segment--medium"
            style={{ width: `${mediumPct}%` }}
          />
          <span
            className="dashboard-severity-segment dashboard-severity-segment--low"
            style={{ width: `${lowPct}%` }}
          />
        </div>

        <div className="dashboard-severity-legend-grid">
          <div className="dashboard-severity-legend-item">
            <span className="dashboard-severity-legend-main">
              <span className="dashboard-severity-dot dashboard-severity-dot--high" />
              <span>High</span>
            </span>
            <strong>{highCount}</strong>
            <span>{highPct}%</span>
          </div>
          <div className="dashboard-severity-legend-item">
            <span className="dashboard-severity-legend-main">
              <span className="dashboard-severity-dot dashboard-severity-dot--medium" />
              <span>Medium</span>
            </span>
            <strong>{mediumCount}</strong>
            <span>{mediumPct}%</span>
          </div>
          <div className="dashboard-severity-legend-item">
            <span className="dashboard-severity-legend-main">
              <span className="dashboard-severity-dot dashboard-severity-dot--low" />
              <span>Low</span>
            </span>
            <strong>{lowCount}</strong>
            <span>{lowPct}%</span>
          </div>
        </div>

        <div className="dashboard-severity-insights">
          <div className="dashboard-severity-insight">
            <span>Properties under high exposure</span>
            <strong>{highExposureProperties}</strong>
          </div>
          <div className="dashboard-severity-insight">
            <span>Most impacted region</span>
            <strong>{mostImpactedRegion}</strong>
          </div>
          <div className="dashboard-severity-insight">
            <span>Alerts within 20 km</span>
            <strong>{alertsWithin20Km}</strong>
          </div>
        </div>
      </div>
    </article>
  )
}

