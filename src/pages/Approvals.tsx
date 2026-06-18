/**
 * Approvals
 *
 * What this page does
 * -------------------
 * This page is the superadmin review surface for advisory and insight approval
 * requests. It shows the request list, opens editable previews, and allows the
 * approver to approve, reject, send, or edit content before the final action.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Start with the request filters, then read the preview-document helpers, and
 * finally follow the approval card and modal flow. The key logic here is not
 * the card UI, but the editable preview behavior and the guardrails around it.
 *
 * When to change this file
 * ------------------------
 * Update this page when approval states, preview editing, review permissions,
 * or request routing rules change.
 *
 * What this file does not do
 * --------------------------
 * It does not generate advisories or build the final email body from scratch.
 * It consumes already-created requests and gives the approver a controlled way
 * to inspect and adjust them.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CheckCircle2, Clock3, Eye, Loader2, RefreshCw, Save as SaveIcon, Send, X } from 'lucide-react'
import { approvalsApi } from '../api/approvals'
import { notificationsApi } from '../api/notifications'
import { useAuth } from '../auth/AuthContext'
import { EmailRichEditor } from '../components/compose/EmailRichEditor'
import type { ApprovalListResponse, ApprovalRequest } from '../types/approval'
import { isSuperadmin } from '../utils/authRoles'
import { formatAppDateTime } from '../utils/dateTime'
import {
  IMPACT_MAP_PLACEHOLDER,
  injectBrowserImpactMapIntoEmailHtml,
  mapPreviewErrorHtml,
} from '../utils/emailPreviewImpactMap'
import { normalizeEmailPreviewFrame } from '../utils/emailPreviewFrame'
import type { ImpactMapPayload } from '../utils/renderImpactMapImage'

function statusLabel(status: string): string {
  if (status === 'sent') return 'Sent'
  if (status === 'approved') return 'Approved'
  if (status === 'rejected') return 'Rejected'
  return 'Pending'
}

function formatDate(value: string | null): string {
  return formatAppDateTime(value)
}

function plainPreview(item: ApprovalRequest): string {
  const text = String(item.message_text || '').replace(/\s+/g, ' ').trim()
  if (text) return text
  return String(item.html_body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// Escape preview text before injecting it into a simple HTML fallback.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function plainTextHtml(value: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /></head><body style="margin:0;background:#ffffff;color:#0f172a;font-family:Segoe UI,Arial,sans-serif;"><pre style="white-space:pre-wrap;margin:0;padding:22px;font:600 15px/1.55 Segoe UI,Arial,sans-serif;">${escapeHtml(value)}</pre></body></html>`
}

// Insight approvals need a specialized preview document because the approver
// must be able to edit the same row-level content that will later be sent.
function buildInsightApprovalPreviewDoc(item: ApprovalRequest, editable: boolean): string {
  const content = item.html_body || plainTextHtml(item.message_text || '')
  if (!editable || item.item_type !== 'insight') return content
  const controls = `
<style data-raven-approval-preview="true">
tr[data-insight-alert-id] td:last-child{position:relative;}
tr[data-insight-alert-id].insight-row-hover td{background:#eef6ff!important;}
.insight-row-actions{position:absolute;right:8px;transform:translateY(-2px);display:none;gap:6px;z-index:20;font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif;}
tr[data-insight-alert-id].insight-row-hover .insight-row-actions{display:inline-flex;}
.insight-row-actions button{border:1px solid #cbd5e1;border-radius:999px;background:#fff;color:#0f172a;padding:6px 12px;font-size:12px;font-weight:700;letter-spacing:0;line-height:1;cursor:pointer;box-shadow:0 8px 18px rgba(15,23,42,.12);}
.insight-row-actions button[data-action="scope"]{border-color:rgba(37,99,235,.36);color:#1d4ed8;font-weight:600;}
.insight-row-actions button[data-action="remove"]{min-width:40px;padding:5px 0;font-size:15px;color:#b91c1c;border-color:rgba(220,38,38,.35);}
</style>
<script>
(function(){
  function cleanHtml(){
    var clone=document.documentElement.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll('script,style[data-raven-approval-preview],.insight-row-actions'),function(node){node.remove();});
    Array.prototype.forEach.call(clone.querySelectorAll('.insight-row-hover'),function(node){node.classList.remove('insight-row-hover');});
    return '<!DOCTYPE html>\\n'+clone.outerHTML;
  }
  function post(){window.parent.postMessage({source:'raven-approval-preview',approvalId:${item.id},htmlBody:cleanHtml()},'*');}
  function headingRows(){
    return Array.prototype.filter.call(document.querySelectorAll('tr'),function(row){
      var text=(row.textContent||'').replace(/\\s+/g,' ').trim();
      return text==='India'||text==='International';
    });
  }
  function findHeading(label){return headingRows().filter(function(row){return (row.textContent||'').replace(/\\s+/g,' ').trim()===label;})[0]||null;}
  function ensureHeading(label){
    var existing=findHeading(label);
    if(existing) return existing;
    var template=findHeading('India')||findHeading('International');
    var parent=template?template.parentNode:null;
    if(!template||!parent) return null;
    var heading=template.cloneNode(true);
    var cell=heading.querySelector('td');
    if(cell) cell.textContent=label;
    parent.appendChild(heading);
    return heading;
  }
  function sectionEnd(heading){
    var row=heading?heading.nextElementSibling:null;
    while(row){
      var text=(row.textContent||'').replace(/\\s+/g,' ').trim();
      if(text==='India'||text==='International') return row;
      row=row.nextElementSibling;
    }
    return null;
  }
  function renumber(){
    headingRows().forEach(function(heading){
      var index=1;
      var row=heading.nextElementSibling;
      while(row){
        var text=(row.textContent||'').replace(/\\s+/g,' ').trim();
        if(text==='India'||text==='International') break;
        if(row.hasAttribute('data-insight-alert-id')){
          var first=row.querySelector('td');
          if(first) first.textContent=index+'.';
          index+=1;
        }
        row=row.nextElementSibling;
      }
    });
  }
  function attach(row){
    if(!row||row.querySelector('.insight-row-actions')) return;
    var controls=document.createElement('span');
    controls.className='insight-row-actions';
    var scopeButton=document.createElement('button');
    scopeButton.type='button';
    scopeButton.setAttribute('data-action','scope');
    var updateLabel=function(){scopeButton.textContent=row.getAttribute('data-insight-scope')==='International'?'→ India':'→ International';};
    updateLabel();
    scopeButton.addEventListener('click',function(event){
      event.preventDefault();event.stopPropagation();
      var target=row.getAttribute('data-insight-scope')==='International'?'India':'International';
      var heading=ensureHeading(target);
      if(heading){
        var end=sectionEnd(heading);
        row.setAttribute('data-insight-scope',target);
        if(end){end.parentNode.insertBefore(row,end);}else{heading.parentNode.appendChild(row);}
        updateLabel();renumber();post();
      }
    });
    var removeButton=document.createElement('button');
    removeButton.type='button';
    removeButton.setAttribute('data-action','remove');
    removeButton.textContent='x';
    removeButton.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();row.remove();renumber();post();});
    controls.appendChild(scopeButton);
    controls.appendChild(removeButton);
    (row.querySelector('td:last-child')||row).appendChild(controls);
    row.addEventListener('mouseenter',function(){row.classList.add('insight-row-hover');});
    row.addEventListener('mouseleave',function(){row.classList.remove('insight-row-hover');});
  }
  Array.prototype.forEach.call(document.querySelectorAll('tr[data-insight-alert-id]'),attach);
}());
</script>`
  if (/<\/body>/i.test(content)) return content.replace(/<\/body>/i, `${controls}</body>`)
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /></head><body>${content}${controls}</body></html>`
}

type ApprovalActionState = 'approved' | 'rejected' | 'sent' | null
type AdvisoryPreviewMode = 'editor' | 'email'

function ApprovalCard({
  item,
  canDecide,
  canSend,
  busy,
  actionState,
  onApprove,
  onReject,
  onSend,
  onPreview,
}: {
  item: ApprovalRequest
  canDecide: boolean
  canSend: boolean
  busy: boolean
  actionState: ApprovalActionState
  onApprove: (item: ApprovalRequest) => void
  onReject: (item: ApprovalRequest) => void
  onSend: (item: ApprovalRequest) => void
  onPreview: (item: ApprovalRequest) => void
}) {
  const recipients = item.recipient_emails.join(', ')
  const groups = item.recipient_group_names.join(', ')
  const recipientSummary = groups
    ? `${recipients || 'No direct recipients'} | ${groups}`
    : recipients || 'No direct recipients'
  const approveActive = actionState === 'approved'
  const rejectActive = actionState === 'rejected'
  const sendActive = actionState === 'sent'
  return (
    <article className={`approval-card approval-card--${item.status}`}>
      <div className="approval-card-main">
        <div className="approval-card-head">
          <div className="approval-card-title-block">
            <div className="approval-kicker">{item.item_type === 'insight' ? 'Insight' : 'Advisory'}</div>
            <h3>{item.title}</h3>
          </div>
          <span className={`approval-status approval-status--${item.status}`}>{statusLabel(item.status)}</span>
        </div>
        <div className="approval-card-meta">
          <span>Requested {formatDate(item.created_at)}</span>
          <span>{item.requester_email || 'Unknown requester'}</span>
          <span>{item.approver_email || 'Unknown approver'}</span>
        </div>
        <p className="approval-preview-text">{plainPreview(item) || 'No preview content available.'}</p>
        <div className="approval-card-foot">
          <div className="approval-recipient-line" title={recipientSummary}>{recipientSummary}</div>
          <div className="approval-card-actions">
            <button
              type="button"
              className="approval-icon-button approval-icon-button--preview"
              onClick={() => onPreview(item)}
              aria-label="Preview approval request"
              title="Preview"
            >
              <Eye size={15} />
            </button>
            {canDecide ? (
              <>
                <button
                  type="button"
                  className={`approval-icon-button approval-icon-button--approve${approveActive ? ' is-success' : ''}`}
                  disabled={busy}
                  onClick={() => onApprove(item)}
                  aria-label="Approve request"
                  title="Approve"
                >
                  <Check size={15} />
                </button>
                <button
                  type="button"
                  className={`approval-icon-button approval-icon-button--reject${rejectActive ? ' is-danger' : ''}`}
                  disabled={busy}
                  onClick={() => onReject(item)}
                  aria-label="Reject request"
                  title="Reject"
                >
                  <X size={15} />
                </button>
              </>
            ) : null}
            {canSend ? (
              <button
                type="button"
                className={`approval-icon-button approval-icon-button--send${sendActive ? ' is-success' : ''}`}
                disabled={busy}
                onClick={() => onSend(item)}
                aria-label="Send approved request"
                title="Send approved"
              >
                {sendActive ? <Check size={15} /> : <Send size={15} />}
              </button>
            ) : null}
          </div>
        </div>
        {item.requester_notes ? <div className="approval-note">Requester note: {item.requester_notes}</div> : null}
        {item.decision_notes ? <div className="approval-note">Decision note: {item.decision_notes}</div> : null}
      </div>
    </article>
  )
}

// The approval queue is intentionally split into request summary, preview, and
// action workflow so the approver can reason about each decision separately.
export default function ApprovalsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<ApprovalRequest | null>(null)
  const [previewText, setPreviewText] = useState('')
  const [previewSubject, setPreviewSubject] = useState('')
  const [advisoryPreviewMode, setAdvisoryPreviewMode] = useState<AdvisoryPreviewMode>('email')
  const [advisoryEditorHtml, setAdvisoryEditorHtml] = useState('')
  const [advisoryPreviewHtml, setAdvisoryPreviewHtml] = useState('')
  const [advisoryPreviewError, setAdvisoryPreviewError] = useState<string | null>(null)
  const [isRenderingAdvisoryPreview, setIsRenderingAdvisoryPreview] = useState(false)
  const [isSavingAdvisoryChanges, setIsSavingAdvisoryChanges] = useState(false)
  const [actionStates, setActionStates] = useState<Record<number, ApprovalActionState>>({})
  // Load the approval queue once, then derive each visible bucket from it.
  const { data, isFetching } = useQuery({
    queryKey: ['approvals'],
    queryFn: approvalsApi.list,
  })

  const actingAsSuperadmin = isSuperadmin(user)
  const items = data?.items || []
  // Pending items stay in the primary worklist; later buckets are for review
  // history and confirmation after decisions have been made.
  const firstColumnItems = useMemo(
    () => items.filter((item) => actingAsSuperadmin ? item.status === 'pending' : ['pending', 'rejected'].includes(item.status)),
    [actingAsSuperadmin, items],
  )
  const approvedItems = useMemo(
    () => items.filter((item) => ['approved', 'sent'].includes(item.status)),
    [items],
  )
  const sentItems = useMemo(
    () => items.filter((item) => item.status === 'sent'),
    [items],
  )

  const patchApprovalInCache = useCallback((updated: ApprovalRequest) => {
    queryClient.setQueryData<ApprovalListResponse>(['approvals'], (current) => {
      const existingItems = current?.items || []
      const index = existingItems.findIndex((item) => item.id === updated.id)
      if (index === -1) {
        return { items: [updated, ...existingItems] }
      }
      const nextItems = [...existingItems]
      nextItems[index] = updated
      return { items: nextItems }
    })
  }, [queryClient])

  const approveMutation = useMutation({
    mutationFn: (item: ApprovalRequest) => approvalsApi.approve(item.id),
    onSuccess: (updated) => {
      patchApprovalInCache(updated)
      setFeedback('Approval request approved.')
    },
    onError: (error, item) => {
      setActionStates((current) => ({ ...current, [item.id]: null }))
      setFeedback(error instanceof Error ? error.message : 'Unable to approve request.')
    },
  })
  const rejectMutation = useMutation({
    mutationFn: (item: ApprovalRequest) => approvalsApi.reject(item.id),
    onSuccess: (updated) => {
      patchApprovalInCache(updated)
      setFeedback('Approval request rejected.')
    },
    onError: (error, item) => {
      setActionStates((current) => ({ ...current, [item.id]: null }))
      setFeedback(error instanceof Error ? error.message : 'Unable to reject request.')
    },
  })
  const sendMutation = useMutation({
    mutationFn: (item: ApprovalRequest) => approvalsApi.send(item.id),
    onSuccess: (result, item) => {
      patchApprovalInCache({
        ...item,
        status: result.status,
        sent_at: new Date().toISOString(),
      })
      setFeedback(`Approved item sent to ${result.delivered_count} recipient(s).`)
      void queryClient.invalidateQueries({ queryKey: ['approvals'] })
      void queryClient.invalidateQueries({ queryKey: ['delivery-history'] })
    },
    onError: (error, item) => {
      setActionStates((current) => ({ ...current, [item.id]: null }))
      setFeedback(error instanceof Error ? error.message : 'Unable to send approved request.')
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({ item, messageText, htmlBody, subject }: { item: ApprovalRequest; messageText?: string; htmlBody?: string; subject?: string }) =>
      approvalsApi.update(item.id, {
        subject,
        message_text: messageText,
        html_body: htmlBody,
      }),
    onSuccess: (updated) => {
      patchApprovalInCache(updated)
      setPreviewItem(updated)
      setPreviewText(updated.message_text || '')
      setPreviewSubject(updated.subject || updated.title)
      setFeedback('Approval draft updated.')
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : 'Unable to update approval draft.')
    },
  })

  const busy = approveMutation.isPending || rejectMutation.isPending || sendMutation.isPending || updateMutation.isPending
  const isEditableAdvisoryPreview = Boolean(
    previewItem
    && actingAsSuperadmin
    && previewItem.status === 'pending'
    && previewItem.item_type === 'advisory',
  )
  const advisoryWordCount = useMemo(
    () => previewText.trim().split(/\s+/).filter(Boolean).length,
    [previewText],
  )
  const savedAdvisoryHtml = String(previewItem?.html_body || '')
  const advisoryEditorDirty = useMemo(
    () => advisoryEditorHtml !== savedAdvisoryHtml,
    [advisoryEditorHtml, savedAdvisoryHtml],
  )
  const advisoryPreviewDocument = advisoryEditorDirty
    ? (advisoryEditorHtml || savedAdvisoryHtml || advisoryPreviewHtml || plainTextHtml(previewText))
    : (advisoryPreviewHtml || savedAdvisoryHtml || advisoryEditorHtml || plainTextHtml(previewText))

  const markAction = (item: ApprovalRequest, state: Exclude<ApprovalActionState, null>) => {
    setActionStates((current) => ({ ...current, [item.id]: state }))
  }

  const buildApprovalAdvisoryPreviewHtml = useCallback(async (
    item: ApprovalRequest,
    subject: string,
    messageText: string,
    options?: { fallbackOnMapRenderError?: boolean },
  ) => {
    const preview = await approvalsApi.getAdvisoryPreviewEmail(item.id, {
      subject,
      message_text: messageText,
    })
    const html = String(preview.html || '').trim()
    if (!html) {
      throw new Error('Approval preview service returned an empty email body.')
    }
    if (!html.includes(IMPACT_MAP_PLACEHOLDER)) {
      return html
    }

    try {
      const payload = (await notificationsApi.getImpactMapPayload(item.notification_id)) as ImpactMapPayload
      return await injectBrowserImpactMapIntoEmailHtml(html, payload)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown map rendering error.'
      if (options?.fallbackOnMapRenderError) {
        return html.replace(IMPACT_MAP_PLACEHOLDER, mapPreviewErrorHtml(message))
      }
      throw new Error(`Live map snapshot failed: ${message}`)
    }
  }, [])

  // Keep the preview pane aligned with the selected request and reset any
  // transient editing state when the target item changes.
  useEffect(() => {
    if (!previewItem) return
    setPreviewText(previewItem.message_text || '')
    setPreviewSubject(previewItem.subject || previewItem.title)
    setAdvisoryEditorHtml(previewItem.html_body || '')
  }, [previewItem])

  useEffect(() => {
    if (!previewItem) return
    setAdvisoryPreviewMode('email')
    setAdvisoryEditorHtml(previewItem.html_body || '')
    setAdvisoryPreviewHtml('')
    setAdvisoryPreviewError(null)
    setIsRenderingAdvisoryPreview(false)
    setIsSavingAdvisoryChanges(false)
  }, [previewItem?.id, previewItem?.html_body])

  useEffect(() => {
    const handlePreviewMessage = (event: MessageEvent) => {
      const payload = event.data
      if (!payload || payload.source !== 'raven-approval-preview') return
      if (!previewItem || Number(payload.approvalId) !== previewItem.id) return
      const htmlBody = String(payload.htmlBody || '').trim()
      if (!htmlBody) return
      updateMutation.mutate({
        item: previewItem,
        messageText: previewItem.message_text || undefined,
        htmlBody,
        subject: previewItem.subject || previewItem.title,
      })
    }
    window.addEventListener('message', handlePreviewMessage)
    return () => window.removeEventListener('message', handlePreviewMessage)
  }, [previewItem, updateMutation])

  useEffect(() => {
    if (!previewItem || !isEditableAdvisoryPreview || advisoryEditorDirty) {
      setAdvisoryPreviewHtml('')
      setAdvisoryPreviewError(null)
      setIsRenderingAdvisoryPreview(false)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      setIsRenderingAdvisoryPreview(true)
      setAdvisoryPreviewError(null)
      void buildApprovalAdvisoryPreviewHtml(previewItem, previewSubject, previewText, { fallbackOnMapRenderError: true })
        .then((html) => {
          if (!cancelled) {
            setAdvisoryPreviewHtml(html)
          }
        })
        .catch((error) => {
          if (cancelled) return
          setAdvisoryPreviewError(error instanceof Error ? error.message : 'Preview render failed.')
        })
        .finally(() => {
          if (!cancelled) {
            setIsRenderingAdvisoryPreview(false)
          }
        })
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    buildApprovalAdvisoryPreviewHtml,
    advisoryEditorDirty,
    isEditableAdvisoryPreview,
    previewItem,
    previewSubject,
    previewText,
  ])

  const saveAdvisoryPreview = async (options?: { switchToEmailPreview?: boolean }) => {
    if (!previewItem) return
    if (!previewText.trim()) {
      setFeedback('Advisory text cannot be empty.')
      return
    }
    setFeedback(null)
    setIsSavingAdvisoryChanges(true)
    try {
      const shouldSaveEditorHtml = advisoryPreviewMode === 'editor' || (advisoryPreviewMode === 'email' && advisoryEditorDirty)
      const htmlBody = shouldSaveEditorHtml
        ? advisoryEditorHtml.trim()
        : await buildApprovalAdvisoryPreviewHtml(previewItem, previewSubject, previewText)
      if (!htmlBody) {
        throw new Error('Email editor content cannot be empty.')
      }
      await updateMutation.mutateAsync({
        item: previewItem,
        messageText: previewText,
        htmlBody,
        subject: previewSubject,
      })
      if (options?.switchToEmailPreview) {
        setAdvisoryPreviewMode('email')
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to refresh advisory preview.')
    } finally {
      setIsSavingAdvisoryChanges(false)
    }
  }

  const downloadAdvisoryPdf = () => {
    const printableHtml = advisoryPreviewDocument.trim()
    if (!printableHtml) {
      setFeedback('No advisory preview is available to download.')
      return
    }
    const printWindow = window.open('', '_blank', 'width=960,height=900')
    if (!printWindow) {
      setFeedback('Allow pop-ups to download PDF.')
      return
    }
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Approved Advisory PDF</title>
  <style>
    @page { size: A4; margin: 10mm; }
    html, body { margin: 0; padding: 0; background: #ffffff; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    img { max-width: 100%; }
  </style>
</head>
<body>${printableHtml}</body>
</html>`)
    printWindow.document.close()

    const printWhenReady = () => {
      printWindow.focus()
      printWindow.print()
    }

    const images = Array.from(printWindow.document.images)
    if (!images.length) {
      window.setTimeout(printWhenReady, 250)
      return
    }

    let pendingImages = images.length
    let printed = false
    const finish = () => {
      pendingImages -= 1
      if (printed || pendingImages > 0) return
      printed = true
      window.setTimeout(printWhenReady, 250)
    }

    window.setTimeout(() => {
      if (printed) return
      printed = true
      printWhenReady()
    }, 8000)

    for (const image of images) {
      if (image.complete && image.naturalWidth > 0) {
        finish()
        continue
      }
      image.addEventListener('load', finish, { once: true })
      image.addEventListener('error', finish, { once: true })
    }
  }

  return (
    <section className="approvals-page">
      <div className="approvals-page-head" aria-label="Approval summary">
        <div className="approvals-kpi-group">
          <div className="approval-stat approval-stat--pending">
            <span className="approval-stat-icon"><Clock3 size={16} /></span>
            <div>
              <span>{actingAsSuperadmin ? 'Needs action' : 'Active'}</span>
              <strong>{firstColumnItems.length}</strong>
            </div>
          </div>
          <div className="approval-stat approval-stat--approved">
            <span className="approval-stat-icon"><CheckCircle2 size={16} /></span>
            <div>
              <span>Approved</span>
              <strong>{approvedItems.length}</strong>
            </div>
          </div>
          <div className="approval-stat approval-stat--sent">
            <span className="approval-stat-icon"><Send size={16} /></span>
            <div>
              <span>Sent</span>
              <strong>{sentItems.length}</strong>
            </div>
          </div>
        </div>
        <div className={`approval-summary${isFetching ? ' is-refreshing' : ''}`} aria-live="polite">
          <RefreshCw size={14} />
          <span>{isFetching ? 'Refreshing' : 'Up to date'}</span>
        </div>
      </div>
      {feedback ? <div className="compose-meta-note">{feedback}</div> : null}
      <div className="approval-columns">
        <section className="approval-column">
          <div className="approval-column-head">
            <h2>{actingAsSuperadmin ? 'Needs action' : 'Sent for approval'}</h2>
            <span>{firstColumnItems.length}</span>
          </div>
          <div className="approval-card-list">
            {firstColumnItems.map((item) => (
              <ApprovalCard
                key={item.id}
                item={item}
                canDecide={actingAsSuperadmin && item.status === 'pending'}
                canSend={false}
                busy={busy}
                actionState={actionStates[item.id] || null}
                onApprove={(row) => { markAction(row, 'approved'); approveMutation.mutate(row) }}
                onReject={(row) => { markAction(row, 'rejected'); rejectMutation.mutate(row) }}
                onSend={(row) => { markAction(row, 'sent'); sendMutation.mutate(row) }}
                onPreview={setPreviewItem}
              />
            ))}
            {!isFetching && firstColumnItems.length === 0 ? <div className="approval-empty">No requests in this column.</div> : null}
          </div>
        </section>
        <section className="approval-column">
          <div className="approval-column-head">
            <h2>Completed</h2>
            <span>{approvedItems.length}</span>
          </div>
          <div className="approval-card-list">
            {approvedItems.map((item) => (
              <ApprovalCard
                key={item.id}
                item={item}
                canDecide={false}
                canSend={item.status === 'approved'}
                busy={busy}
                actionState={actionStates[item.id] || null}
                onApprove={(row) => { markAction(row, 'approved'); approveMutation.mutate(row) }}
                onReject={(row) => { markAction(row, 'rejected'); rejectMutation.mutate(row) }}
                onSend={(row) => { markAction(row, 'sent'); sendMutation.mutate(row) }}
                onPreview={setPreviewItem}
              />
            ))}
            {!isFetching && approvedItems.length === 0 ? <div className="approval-empty">No approved requests yet.</div> : null}
          </div>
        </section>
      </div>

      {previewItem ? (
        <div className="send-advisories-preview-backdrop" role="dialog" aria-modal="true" aria-label="Approval preview">
          <div className="send-advisories-preview-modal">
            <div className="send-advisories-preview-head">
              <div className="send-advisories-preview-title">{previewItem.subject || previewItem.title}</div>
              <div className="approval-preview-head-actions">
                {actingAsSuperadmin && previewItem.status === 'pending' && previewItem.item_type === 'advisory' ? (
                  <button
                    type="button"
                    className="btn-primary approval-preview-save"
                    onClick={() => { void saveAdvisoryPreview() }}
                    disabled={updateMutation.isPending || isSavingAdvisoryChanges}
                  >
                    {updateMutation.isPending || isSavingAdvisoryChanges ? 'Saving' : 'Save edits'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn-secondary btn-danger-action send-advisories-preview-close"
                  onClick={() => setPreviewItem(null)}
                  aria-label="Close preview"
                  title="Close preview"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            {isEditableAdvisoryPreview ? (
              <div className="approval-preview-advisory-shell">
                <div className="approval-preview-advisory-panel">
                  <div className="compose-panel-heading approval-preview-generated-head">
                    <div>
                      <h2>Generated Advisory</h2>
                      <p className="compose-panel-copy">Review, edit, and approve the advisory email.</p>
                    </div>
                    <div className="compose-word-count">{advisoryWordCount} words</div>
                  </div>

                  <label className="compose-label-stack approval-preview-subject-field">
                    Email Subject
                    <input
                      value={previewSubject}
                      onChange={(event) => setPreviewSubject(event.target.value)}
                      placeholder="Enter subject line"
                    />
                  </label>

                  <div className="compose-pill-tabs approval-preview-tabs">
                    <button
                      type="button"
                      className={`compose-pill${advisoryPreviewMode === 'editor' ? ' is-active' : ''}`}
                      onClick={() => setAdvisoryPreviewMode('editor')}
                    >
                      Editor
                    </button>
                    <button
                      type="button"
                      className={`compose-pill${advisoryPreviewMode === 'email' ? ' is-active' : ''}`}
                      onClick={() => setAdvisoryPreviewMode('email')}
                    >
                      Email Preview
                    </button>
                    <button type="button" className="compose-pill" onClick={downloadAdvisoryPdf}>
                      Download PDF
                    </button>
                    <button
                      type="button"
                      className="compose-pill compose-pill-icon"
                      onClick={() => { void saveAdvisoryPreview() }}
                      disabled={updateMutation.isPending || isSavingAdvisoryChanges}
                      title={advisoryPreviewMode === 'editor' ? 'Apply email editor changes' : 'Apply content and refresh email preview'}
                      aria-label={advisoryPreviewMode === 'editor' ? 'Apply email editor changes' : 'Apply content and refresh email preview'}
                    >
                      {updateMutation.isPending || isSavingAdvisoryChanges ? <Loader2 size={14} className="spin" /> : advisoryPreviewMode === 'editor' ? <SaveIcon size={14} /> : <RefreshCw size={14} />}
                    </button>
                  </div>

                  {advisoryPreviewMode === 'editor' ? (
                    <div className="compose-editor-output approval-preview-editor-output">
                      <EmailRichEditor
                        content={advisoryEditorHtml || advisoryPreviewDocument}
                        onChange={(html) => {
                          setAdvisoryEditorHtml(html)
                        }}
                      />
                      <div className="compose-editor-meta approval-preview-editor-meta">
                        <span>Edit the branded email directly here.</span>
                        <span>{advisoryEditorDirty ? 'Unsaved email editor changes' : 'Editor synced with saved email layout'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="compose-canvas-shell approval-preview-canvas-shell">
                      {isRenderingAdvisoryPreview && !advisoryEditorDirty ? (
                        <div className="compose-meta-note approval-preview-live-status">
                          <Loader2 size={14} className="spin" />
                          <span>Rendering live advisory preview...</span>
                        </div>
                      ) : null}
                      {advisoryPreviewError && !advisoryEditorDirty ? (
                        <div className="compose-alert-error approval-preview-live-status">
                          Live advisory preview failed: {advisoryPreviewError}
                        </div>
                      ) : null}
                      <div className="compose-canvas compose-canvas-preview approval-preview-email-canvas">
                        <iframe
                          title="Approval email preview"
                          className="compose-email-iframe approval-preview-email-frame"
                          sandbox=""
                          referrerPolicy="no-referrer"
                          onLoad={(event) => normalizeEmailPreviewFrame(event.currentTarget)}
                          srcDoc={advisoryPreviewDocument}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <iframe
                title="Approval email preview"
                className="send-advisories-preview-frame"
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
                onLoad={(event) => normalizeEmailPreviewFrame(event.currentTarget)}
                srcDoc={buildInsightApprovalPreviewDoc(
                  previewItem,
                  actingAsSuperadmin && previewItem.status === 'pending',
                )}
              />
            )}
            {actingAsSuperadmin && previewItem.status === 'pending' && previewItem.item_type === 'insight' ? (
              <div className="compose-meta-note approval-preview-edit-note">
                Insight edits save automatically when an item is removed or moved between India and International.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
