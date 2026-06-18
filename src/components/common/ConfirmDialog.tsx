/**
 * Confirm Dialog Primitive
 *
 * This small component provides the standard yes/no confirmation overlay used
 * across destructive and sensitive actions in the frontend.
 *
 * It is responsible for:
 * - rendering a modal-style confirmation prompt
 * - exposing safe and danger button styles
 * - keeping dialog behavior consistent across screens
 *
 * What this file does not do:
 * - it does not decide whether a confirmation is needed
 * - it does not manage application state beyond the visible dialog
 */
interface ConfirmDialogProps {
  open: boolean
  title: string
  body: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="confirm-dialog-backdrop">
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <h3 id="confirm-dialog-title" className="confirm-dialog-title">{title}</h3>
        <p className="confirm-dialog-body">{body}</p>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
