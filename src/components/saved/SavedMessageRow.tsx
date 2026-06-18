/**
 * Module: Savedmessagerow
 * Purpose: Core module responsible for Savedmessagerow concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

import { SeverityChip } from '../common/SeverityChip'
import { StatusChip } from '../common/StatusChip'
import { formatAppDateTime } from '../../utils/dateTime'

interface SavedMessageRowProps {
  item: any
  templateName: string
  checked: boolean
  onToggle: (id: number) => void
  onOpen: (id: number) => void
  onArchive: (id: number) => void
  onDelete: (id: number) => void
}

export function SavedMessageRow({ item, templateName, checked, onToggle, onOpen, onArchive, onDelete }: SavedMessageRowProps) {
  return (
    <tr>
      <td><input type="checkbox" checked={checked} onChange={() => onToggle(item.id)} /></td>
      <td>{formatAppDateTime(item.updated_at)}</td>
      <td>{item.heading || '(Untitled)'}</td>
      <td>{templateName}</td>
      <td><SeverityChip severity={item.severity} /></td>
      <td><StatusChip status={item.approval_status} /></td>
      <td><StatusChip status={item.status} /></td>
      <td className="saved-row-actions">
        <button className="btn-secondary" title="Open" aria-label="Open" onClick={() => onOpen(item.id)}>
          {'\u2197'}
        </button>
        <button className="btn-secondary" title="Archive" aria-label="Archive" onClick={() => onArchive(item.id)}>
          {'\uD83D\uDCC1'}
        </button>
        <button className="btn-secondary" title="Delete" aria-label="Delete" onClick={() => onDelete(item.id)}>
          {'\uD83D\uDDD1'}
        </button>
      </td>
    </tr>
  )
}

