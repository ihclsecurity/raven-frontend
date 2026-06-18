/**
 * Severity Chip
 *
 * This component renders the compact severity label used throughout tables and
 * summary cards.
 *
 * It is responsible for:
 * - mapping the severity value to a visual style
 * - keeping missing severities visible as a simple placeholder
 *
 * What this file does not do:
 * - it does not interpret severity values
 * - it does not choose the severity level shown to the user
 */
const SEVERITY_CLASS_MAP: Record<string, string> = {
  Catastrophic: 'severity-chip--catastrophic',
  Major: 'severity-chip--major',
  Moderate: 'severity-chip--moderate',
  Minor: 'severity-chip--minor',
  Informational: 'severity-chip--informational',
}

export function SeverityChip({ severity }: { severity: string | null }) {
  if (!severity) return <span className="severity-chip-empty">-</span>

  const severityClass = SEVERITY_CLASS_MAP[severity] || 'severity-chip--default'
  return (
    <span className={`severity-chip ${severityClass}`}>
      {severity}
    </span>
  )
}
