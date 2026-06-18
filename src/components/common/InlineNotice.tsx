/**
 * Inline Notice Primitive
 *
 * This component renders the reusable alert-style notice blocks shown inside
 * forms, panels, and workflow screens.
 *
 * It is responsible for:
 * - displaying informational, success, warning, and danger variants
 * - optionally showing a title above the message body
 * - keeping inline feedback visually consistent across the app
 *
 * What this file does not do:
 * - it does not decide when a notice should appear
 * - it does not manage async state or validation logic
 */
import type { ReactNode } from 'react'

type InlineNoticeTone = 'info' | 'success' | 'warning' | 'danger'

interface InlineNoticeProps {
  tone?: InlineNoticeTone
  title?: string
  className?: string
  children: ReactNode
}

export function InlineNotice({
  tone = 'info',
  title,
  className = '',
  children,
}: InlineNoticeProps) {
  const classes = `ui-notice ui-notice--${tone}${className ? ` ${className}` : ''}`
  return (
    <div className={classes} role={tone === 'danger' ? 'alert' : 'status'}>
      {title ? <div className="ui-notice-title">{title}</div> : null}
      <div className="ui-notice-body">{children}</div>
    </div>
  )
}
