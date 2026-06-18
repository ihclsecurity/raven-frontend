/**
 * Status Chip
 *
 * This component renders the small status pill used across notification and
 * approval workflows.
 *
 * It is responsible for:
 * - mapping workflow states to visual chip styles
 * - normalizing underscore-separated status labels for display
 *
 * What this file does not do:
 * - it does not update the underlying status value
 * - it does not decide workflow transitions
 */
const STATUS_CLASS_MAP: Record<string, string> = {
  draft: 'status-chip--draft',
  saved: 'status-chip--saved',
  ready: 'status-chip--ready',
  sent: 'status-chip--sent',
  archived: 'status-chip--archived',
  not_requested: 'status-chip--not-requested',
  pending: 'status-chip--pending',
  approved: 'status-chip--approved',
  rejected: 'status-chip--rejected',
  overridden: 'status-chip--overridden',
}

export function StatusChip({ status }: { status: string }) {
  const statusClass = STATUS_CLASS_MAP[status] || 'status-chip--default'
  return (
    <span className={`status-chip ${statusClass}`}>
      {status.replace('_', ' ')}
    </span>
  )
}
