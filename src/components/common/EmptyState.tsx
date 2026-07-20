/**
 * Raven Empty State Primitive
 *
 * Used when a table, map panel, or workflow has no records to show. It keeps
 * empty states calm and operational rather than visually noisy.
 */
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`raven-empty-state${className ? ` ${className}` : ''}`}>
      {Icon ? (
        <div className="raven-empty-state-icon" aria-hidden="true">
          <Icon size={22} />
        </div>
      ) : null}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className="raven-empty-state-action">{action}</div> : null}
    </div>
  )
}
