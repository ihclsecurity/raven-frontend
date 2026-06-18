/**
 * Module: Approvalstatuspanel
 * Purpose: Core module responsible for Approvalstatuspanel concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { directoryApi } from '../../api/directory'
import { ConfirmDialog } from '../common/ConfirmDialog'
import type { ApprovalRequestChannel } from '../../types/notification'
import { formatAppDateTime } from '../../utils/dateTime'

interface ApprovalStatusPanelProps {
  fields: Record<string, unknown>
  onRequestApproval: (approverContactId: number, channel: ApprovalRequestChannel) => Promise<void>
  onImportApprovalReply: (
    approverContactId: number,
    decision: 'approved' | 'rejected',
    channel?: ApprovalRequestChannel,
    notes?: string,
    replyText?: string,
    editedMessage?: string,
  ) => Promise<void>
  onOverrideApproval: (reason?: string) => Promise<void>
  disabled?: boolean
}

const statusTone: Record<string, { label: string; className: string }> = {
  not_requested: { label: 'Not Requested', className: 'status-not-requested' },
  pending: { label: 'Pending Approval', className: 'status-pending' },
  approved: { label: 'Approved', className: 'status-approved' },
  rejected: { label: 'Rejected', className: 'status-rejected' },
  overridden: { label: 'Override Used', className: 'status-overridden' },
}

export function ApprovalStatusPanel({
  fields,
  onRequestApproval,
  onImportApprovalReply,
  onOverrideApproval,
  disabled = false,
}: ApprovalStatusPanelProps) {
  const { data: approvers } = useQuery({ queryKey: ['directory-approvers'], queryFn: () => directoryApi.listContacts('approver', true) })
  const { data: defaultApprover } = useQuery({ queryKey: ['directory-default-approver'], queryFn: directoryApi.getDefaultApprover })

  const requestedApproverId = Number(fields.requested_approver_id || 0) || null
  const approvalStatus = String(fields.approval_status || 'not_requested')
  const approvalNotes = String(fields.approval_notes || '')
  const overrideReason = String(fields.approval_override_reason || '')
  const approvalRequestedAt = String(fields.approval_requested_at || '')
  const approvalRequestChannel = String(fields.approval_request_channel || 'email') as ApprovalRequestChannel
  const approvalRequestDestination = String(fields.approval_request_destination || '')
  const approvalRequestSubject = String(fields.approval_request_subject || '')
  const approvalRequestMessage = String(fields.approval_request_message || '')
  const approvalRequestStatus = String(fields.approval_request_status || '')
  const approvalRequestSentAt = String(fields.approval_request_sent_at || '')
  const approvalDecisionAt = String(fields.approval_decision_at || '')
  const approvalDecisionById = Number(fields.approval_decision_by_id || 0) || null
  const approvalResponseChannel = String(fields.approval_response_channel || '') as ApprovalRequestChannel | ''
  const approvalResponseText = String(fields.approval_response_text || '')
  const reviewerEditedText = String(fields.edited_text || '')

  const [selectedApproverId, setSelectedApproverId] = useState<number | ''>('')
  const [requestChannel, setRequestChannel] = useState<ApprovalRequestChannel>('email')
  const [notes, setNotes] = useState('')
  const [importDecision, setImportDecision] = useState<'approved' | 'rejected'>('approved')
  const [replyText, setReplyText] = useState('')
  const [editedMessage, setEditedMessage] = useState('')
  const [awaitDialogOpen, setAwaitDialogOpen] = useState(false)
  const [finalOverrideDialogOpen, setFinalOverrideDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (requestedApproverId) {
      setSelectedApproverId(requestedApproverId)
      return
    }
    if (defaultApprover?.id) {
      setSelectedApproverId(defaultApprover.id)
    }
  }, [requestedApproverId, defaultApprover])

  useEffect(() => {
    if (approvalRequestChannel) {
      setRequestChannel(approvalRequestChannel)
    }
  }, [approvalRequestChannel])

  useEffect(() => {
    if (approvalResponseText) {
      setReplyText(approvalResponseText)
    }
  }, [approvalResponseText])

  useEffect(() => {
    if (reviewerEditedText) {
      setEditedMessage(reviewerEditedText)
    }
  }, [reviewerEditedText])

  const tone = statusTone[approvalStatus] || statusTone.not_requested
  const selectedApprover = useMemo(
    () => (approvers || []).find((item) => item.id === Number(selectedApproverId)),
    [approvers, selectedApproverId],
  )
  const decisionApprover = useMemo(
    () => (approvers || []).find((item) => item.id === approvalDecisionById),
    [approvers, approvalDecisionById],
  )

  const withBusy = async (work: () => Promise<void>) => {
    setBusy(true)
    try {
      await work()
      setNotes('')
    } finally {
      setBusy(false)
    }
  }

  const canChooseApprover = approvers && approvers.length > 0
  const canUseSelectedApprover = Number(selectedApproverId) > 0

  return (
    <div className="field-card approval-panel">
      <div className="approval-panel-header">
        <div>
          <p className="field-card-title">Approval Workflow</p>
          <div className="approval-muted">
            Send to one approver, capture their reply, and continue with the reviewed message.
          </div>
        </div>
        <span className={`approval-status-pill ${tone.className}`}>
          {tone.label}
        </span>
      </div>

      <div className="approval-two-col">
        <label>
          Approver
          <select
            value={selectedApproverId}
            onChange={(e) => setSelectedApproverId(e.target.value ? Number(e.target.value) : '')}
            disabled={disabled || !canChooseApprover || busy}
          >
            <option value="">Select approver</option>
            {(approvers || []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.display_name} ({item.email})
              </option>
            ))}
          </select>
        </label>

        <label>
          Analyst Notes
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional context for approver or audit trail"
            disabled={disabled || busy}
          />
        </label>
      </div>

      <div className="approval-two-col">
        <label>
          Request Channel
          <select value={requestChannel} onChange={(e) => setRequestChannel(e.target.value as ApprovalRequestChannel)} disabled={disabled || busy}>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </label>
        <div className="approval-hint">
          Imported reply channel defaults to the request channel.
        </div>
      </div>

      {selectedApprover ? (
        <div className="approval-muted">
          Selected approver: {selectedApprover.display_name} ({selectedApprover.email})
        </div>
      ) : null}

      <div className="approval-action-row">
        <button
          className="btn-primary"
          disabled={disabled || !canUseSelectedApprover || busy}
          onClick={() => withBusy(() => onRequestApproval(Number(selectedApproverId), requestChannel))}
        >
          Send Approval Request
        </button>
        <button
          type="button"
          className="btn-secondary approval-override-button"
          disabled={disabled || approvalStatus === 'approved' || busy}
          onClick={() => setAwaitDialogOpen(true)}
        >
          Override Approval
        </button>
      </div>

      {(approvalRequestDestination || approvalRequestMessage) ? (
        <div className="approval-request-card">
          <div className="approval-request-title">Approval Request Sent</div>
          <div className="approval-request-meta">
            {approvalRequestChannel.toUpperCase()} to {approvalRequestDestination || 'No destination'}
            {approvalRequestStatus ? ` - ${approvalRequestStatus}` : ''}
            {approvalRequestSentAt ? ` - ${formatAppDateTime(approvalRequestSentAt)}` : ''}
          </div>
          {approvalRequestSubject ? <div className="approval-request-subject"><strong>Subject:</strong> {approvalRequestSubject}</div> : null}
          {approvalRequestMessage ? (
            <details className="approval-request-details">
              <summary>View full request message</summary>
              <textarea value={approvalRequestMessage} readOnly rows={6} className="approval-request-textarea" />
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="approval-reply-card">
        <div>
          <p className="field-card-title approval-subtitle">Capture Approver Reply</p>
          <div className="approval-muted">
            Paste the approver reply. If they revised the message, paste that revision below.
          </div>
        </div>

        <div className="approval-two-col">
          <label>
            Decision
            <select value={importDecision} onChange={(e) => setImportDecision(e.target.value as 'approved' | 'rejected')} disabled={disabled || busy}>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <div className="approval-hint">
            Channel: {(approvalResponseChannel || approvalRequestChannel || requestChannel).toUpperCase()}
          </div>
        </div>

        <label>
          Approver Reply Text
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={4}
            placeholder="Paste reply text from email or WhatsApp"
            disabled={disabled || busy}
          />
        </label>

        <label>
          Edited Message From Approver
          <textarea
            value={editedMessage}
            onChange={(e) => setEditedMessage(e.target.value)}
            rows={6}
            placeholder="Paste the revised outbound message from approver"
            disabled={disabled || busy}
          />
        </label>

        <div className="approval-reply-action-row">
          <button
            type="button"
            className="btn-secondary"
            disabled={disabled || !canUseSelectedApprover || busy}
            onClick={() => withBusy(() => onImportApprovalReply(Number(selectedApproverId), importDecision, (approvalResponseChannel || approvalRequestChannel || requestChannel), notes || undefined, replyText || undefined, editedMessage || undefined))}
          >
            Capture Reply
          </button>
          <div className="approval-muted">
            Revised message becomes the current working draft.
          </div>
        </div>
      </div>

      <div className="approval-audit-list">
        <div>Requested approver: {requestedApproverId ? `${selectedApprover?.display_name || 'Selected'} (${requestedApproverId})` : 'None'}</div>
        <div>Requested at: {formatAppDateTime(approvalRequestedAt, 'Not requested')}</div>
        <div>Request channel: {approvalRequestChannel || 'None'}</div>
        <div>Decision by: {decisionApprover ? `${decisionApprover.display_name} (${decisionApprover.email})` : 'None'}</div>
        <div>Decision at: {formatAppDateTime(approvalDecisionAt, 'No decision yet')}</div>
        {approvalNotes ? <div>Decision notes: {approvalNotes}</div> : null}
        {approvalResponseText ? <div>Imported reply captured.</div> : null}
        {overrideReason ? <div>Override reason: {overrideReason}</div> : null}
      </div>

      <ConfirmDialog
        open={awaitDialogOpen}
        title="Approval not yet received"
        body="Choose Await Approval to keep this pending, or Override Approval to continue."
        confirmLabel="Override Approval"
        cancelLabel="Await Approval"
        onConfirm={() => {
          setAwaitDialogOpen(false)
          setFinalOverrideDialogOpen(true)
        }}
        onCancel={() => setAwaitDialogOpen(false)}
      />

      <ConfirmDialog
        open={finalOverrideDialogOpen}
        title="Proceed without approver confirmation?"
        body="This records an override and marks the message ready for delivery."
        confirmLabel={busy ? 'Processing...' : 'Yes, Override'}
        cancelLabel="No"
        danger
        onConfirm={() => {
          void withBusy(async () => {
            await onOverrideApproval(notes || undefined)
            setFinalOverrideDialogOpen(false)
          })
        }}
        onCancel={() => setFinalOverrideDialogOpen(false)}
      />
    </div>
  )
}

