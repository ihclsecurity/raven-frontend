/**
 * Raven Badge Primitive
 *
 * Compact status/risk metadata pill. Existing workflow-specific chips remain
 * untouched; this is a reusable foundation for new shared UI.
 */
import type { ReactNode } from 'react'

type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'critical'

interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}

export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span className={`raven-badge raven-badge--${tone}${className ? ` ${className}` : ''}`}>
      {children}
    </span>
  )
}
