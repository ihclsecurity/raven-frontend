/**
 * Send Advisories
 *
 * What this page does
 * -------------------
 * This page is the operational console for reviewing generated advisories,
 * assigning recipients, choosing approvers, and dispatching the final output.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Start with the advisory filters, then follow the generation and preview
 * helpers, and only then inspect the send/delete actions. The key idea here is
 * that advisories are deduplicated and filtered before they become sendable.
 *
 * When to change this file
 * ------------------------
 * Update this page when advisory selection, preview rendering, approver flow,
 * or refresh behavior changes.
 *
 * What this file does not do
 * --------------------------
 * It does not build the source advisories themselves. It consumes existing
 * notifications, filters them to the sendable set, and manages dispatch.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Loader2, Pencil, RefreshCw, Send, Trash2, Users, X } from 'lucide-react'
import { notificationsApi } from '../api/notifications'
import { datasurfrApi } from '../api/datasurfr'
import { emailGroupsApi } from '../api/emailGroups'
import { approvalsApi } from '../api/approvals'
import { useTemplates } from '../hooks/useTemplates'
import type { Notification } from '../types/notification'
import { FEED_WINDOW_OPTIONS } from '../constants/feedWindows'
import type { AdvisoryBackgroundGenerationState, FeedTopBarControls } from '../components/layout/AppShell'
import { PREFERRED_ADVISORY_TEMPLATE_NAME, findPreferredAdvisoryTemplate } from '../utils/advisoryTemplates'
import { apiTime, formatAppDateTime, formatAppTime } from '../utils/dateTime'
import {
  IMPACT_MAP_PLACEHOLDER,
  injectBrowserImpactMapIntoEmailHtml,
  mapPreviewErrorHtml,
} from '../utils/emailPreviewImpactMap'
import { normalizeEmailPreviewFrame } from '../utils/emailPreviewFrame'
import type { ImpactMapPayload } from '../utils/renderImpactMapImage'

const DAILY_BUSINESS_INSIGHTS = 'daily business insights'
const DAILY_NEWS_SUMMARY = 'daily news summary'

function isEligibleAdvisory(item: Notification): boolean {
  // Only keep advisories that still need attention and are not already part of
  // the business insight or daily news summary workflows.
  if (item.status === 'sent' || item.status === 'archived') {
    return false
  }
  if (['pending', 'approved'].includes(String(item.approval_status || '').toLowerCase())) {
    return false
  }
  const incidentType = String(item.incident_type || '').trim().toLowerCase()
  if (incidentType === DAILY_BUSINESS_INSIGHTS || incidentType === DAILY_NEWS_SUMMARY) {
    return false
  }
  const heading = String(item.heading || '').trim().toLowerCase()
  if (heading.includes(DAILY_BUSINESS_INSIGHTS) || heading.includes(DAILY_NEWS_SUMMARY)) {
    return false
  }
  return true
}

function buildWorkingText(item: Notification): string {
  return String(item.final_text || item.edited_text || item.generated_text || item.source_text || '').trim()
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isDatasurfrAdvisory(item: Notification): boolean {
  // Datasurfr advisories are identified by tags, not just by title text, so we
  // can safely distinguish them from other notifications using the same UI.
  const raw = String(item.tags_json || '').trim()
  if (!raw) return false
  try {
    const parsed = JSON.parse(raw) as { source_provider?: unknown; external_event_id?: unknown; summary_type?: unknown }
    const provider = String(parsed.source_provider || '').toLowerCase()
    const hasExternalEvent = String(parsed.external_event_id || '').trim().length > 0
    const summaryType = String(parsed.summary_type || '').toLowerCase()
    return provider === 'datasurfr' && hasExternalEvent && summaryType !== 'events_selected' && summaryType !== 'region_wise'
  } catch {
    return false
  }
}

function getDatasurfrExternalEventId(item: Notification): string | null {
  const raw = String(item.tags_json || '').trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { external_event_id?: unknown }
    const externalEventId = String(parsed.external_event_id || '').trim()
    return externalEventId || null
  } catch {
    return null
  }
}

export default function SendAdvisoriesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const {
    sharedFeedTimeWindow,
    setSharedFeedTimeWindow,
    feedRefreshNonce,
    triggerFeedRefresh,
    setFeedTopBarControls,
    backgroundGeneratedAdvisories,
    advisoryGenerationState,
    runBackgroundAdvisoryGeneration,
    regenerateAllAdvisories,
  } = useOutletContext<{
    sharedFeedTimeWindow: number
    setSharedFeedTimeWindow: (value: number) => void
    feedRefreshNonce: number
    triggerFeedRefresh: () => void
    setFeedTopBarControls: (controls: FeedTopBarControls | null) => void
    backgroundGeneratedAdvisories: Notification[]
    advisoryGenerationState: AdvisoryBackgroundGenerationState
    runBackgroundAdvisoryGeneration: () => Promise<void>
    regenerateAllAdvisories: () => Promise<void>
  }>()
  const [recipientById, setRecipientById] = useState<Record<number, string>>({})
  const [selectedGroupIdsById, setSelectedGroupIdsById] = useState<Record<number, number[]>>({})
  const [groupMenuForId, setGroupMenuForId] = useState<number | null>(null)
  const [activeRecipientInputId, setActiveRecipientInputId] = useState<number | null>(null)
  const [sendingId, setSendingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [dismissedAdvisoryIds, setDismissedAdvisoryIds] = useState<number[]>([])
  const [selectedApproverUserId, setSelectedApproverUserId] = useState<number | ''>('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<Notification | null>(null)
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isRenderingPreview, setIsRenderingPreview] = useState(false)
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null)
  const { data: templates = [] } = useTemplates(false)

  const nowLabel = formatAppTime()
  const handleRefresh = useCallback(() => {
    triggerFeedRefresh()
    void runBackgroundAdvisoryGeneration()
  }, [runBackgroundAdvisoryGeneration, triggerFeedRefresh])

  useEffect(() => {
    setFeedTopBarControls({
      timeWindow: sharedFeedTimeWindow,
      windowOptions: [...FEED_WINDOW_OPTIONS],
      onTimeWindowChange: setSharedFeedTimeWindow,
      onRefresh: handleRefresh,
      liveLabel: nowLabel,
      refreshLabel: 'Refresh send advisories',
    })
    return () => setFeedTopBarControls(null)
  }, [handleRefresh, nowLabel, setFeedTopBarControls, setSharedFeedTimeWindow, sharedFeedTimeWindow])

  const { data, isFetching } = useQuery({
    queryKey: ['send-advisories-notifications', feedRefreshNonce],
    queryFn: () => notificationsApi.list({ page: 1, page_size: 100 }),
  })
  const { data: alerts = [], isFetching: loadingAlerts } = useQuery({
    queryKey: ['send-advisories-alerts', sharedFeedTimeWindow, feedRefreshNonce],
    queryFn: () => datasurfrApi.listAlerts(sharedFeedTimeWindow),
    staleTime: 60000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
  const { data: emailGroups = [] } = useQuery({
    queryKey: ['email-groups-send-advisories'],
    queryFn: () => emailGroupsApi.list(true),
  })
  const { data: superadmins = [] } = useQuery({
    queryKey: ['approval-superadmins-send-advisories'],
    queryFn: approvalsApi.listSuperadmins,
  })

  const priorityAlerts = useMemo(
    () => alerts.filter((alert) => alert.hotel_impact_level === 'high'),
    [alerts],
  )
  const priorityAlertIds = useMemo(() => new Set(priorityAlerts.map((alert) => String(alert.id))), [priorityAlerts])

  const advisoryTemplate = useMemo(() => findPreferredAdvisoryTemplate(templates), [templates])
  const isLightTheme = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light'
  const menuSurfaceBg = isLightTheme ? '#ffffff' : '#0f172a'
  const menuBorder = isLightTheme ? '#cbd5e1' : '#334155'
  const rowDefaultBg = isLightTheme ? '#f3f4f6' : '#1f2937'
  const rowDefaultText = isLightTheme ? '#111827' : '#e5e7eb'

  // Build the sendable advisory list from both background-generated items and
  // the stored notifications feed, then collapse duplicates by external event.
  const advisories = useMemo(() => {
    const items = [...backgroundGeneratedAdvisories, ...(data?.items || [])]
    const byEventId = new Map<string, Notification>()
    for (const item of items) {
      if (dismissedAdvisoryIds.includes(item.id)) continue
      if (!isEligibleAdvisory(item)) continue
      const matchesTemplate = advisoryTemplate ? item.template_id === advisoryTemplate.id : false
      const looksLikeDatasurfr = isDatasurfrAdvisory(item) || String(item.source_text || '').toLowerCase().includes('datasurfr')
      if (!(matchesTemplate || looksLikeDatasurfr)) continue
      const eventId = getDatasurfrExternalEventId(item)
      if (!eventId || !priorityAlertIds.has(eventId)) continue

      const existing = byEventId.get(eventId)
      if (!existing) {
        byEventId.set(eventId, item)
        continue
      }
      const existingTs = apiTime(existing.updated_at || existing.created_at)
      const candidateTs = apiTime(item.updated_at || item.created_at)
      if (candidateTs > existingTs) {
        byEventId.set(eventId, item)
      }
    }

    return Array.from(byEventId.values()).sort((a, b) => {
      const aTs = apiTime(a.updated_at || a.created_at)
      const bTs = apiTime(b.updated_at || b.created_at)
      return bTs - aTs
    })
  }, [advisoryTemplate, backgroundGeneratedAdvisories, data?.items, dismissedAdvisoryIds, priorityAlertIds])

  // The refresh action asks the background worker to rebuild the advisory list
  // without changing the underlying email template logic.
  const handleGenerateAdvisories = useCallback(async () => {
    setFeedback(null)
    await runBackgroundAdvisoryGeneration()
  }, [runBackgroundAdvisoryGeneration])

  const handleGenerateAgain = useCallback(async () => {
    setFeedback(null)
    await regenerateAllAdvisories()
  }, [regenerateAllAdvisories])

  const buildFallbackPreviewHtml = useCallback((item: Notification) => (
    `<pre style="white-space:pre-wrap;font-family:Segoe UI,Arial,sans-serif;padding:14px;">${escapeHtml(buildWorkingText(item))}</pre>`
  ), [])

  // Preview rendering stays isolated so map injection and iframe normalization
  // can fail safely without affecting the send pipeline.
  const buildPreviewEmailHtml = useCallback(async (
    item: Notification,
    options?: { fallbackOnMapRenderError?: boolean },
  ) => {
    try {
      const preview = await notificationsApi.getEmailPreview(item.id, false)
      const html = String(preview.html || '').trim()
      if (!html) {
        throw new Error('Preview service returned an empty email body.')
      }
      if (!html.includes(IMPACT_MAP_PLACEHOLDER)) {
        return html
      }

      try {
        const payload = (await notificationsApi.getImpactMapPayload(item.id)) as ImpactMapPayload
        return await injectBrowserImpactMapIntoEmailHtml(html, payload)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown map rendering error.'
        console.error('[impact-map] Send Advisories browser map render failed', error)
        if (options?.fallbackOnMapRenderError) {
          return html.replace(IMPACT_MAP_PLACEHOLDER, mapPreviewErrorHtml(message))
        }
        throw new Error(`Live map snapshot failed: ${message}`)
      }

    } catch (error) {
      console.error('[impact-map] Send Advisories preview render failed', error)
      throw error
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!previewItem) {
      setPreviewHtml('')
      setPreviewError(null)
      setIsRenderingPreview(false)
      return
    }

    setPreviewHtml('')
    setPreviewError(null)
    setIsRenderingPreview(true)
    buildPreviewEmailHtml(previewItem, { fallbackOnMapRenderError: true })
      .then((html) => {
        if (!cancelled) {
          setPreviewHtml(html)
        }
      })
      .catch((error) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Preview render failed'
        setPreviewError(message)
        setPreviewHtml(buildFallbackPreviewHtml(previewItem))
      })
      .finally(() => {
        if (!cancelled) {
          setIsRenderingPreview(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [buildFallbackPreviewHtml, buildPreviewEmailHtml, previewItem])

  const handleApprove = async (item: Notification) => {
    const destination = String(recipientById[item.id] || '').trim()
    const selectedGroupIds = selectedGroupIdsById[item.id] || []
    if (!selectedApproverUserId) {
      setFeedback('Select the superadmin approver before sending this advisory for approval.')
      return
    }
    if (!destination && selectedGroupIds.length === 0) {
      setFeedback('Enter recipient email or choose an email group before requesting approval.')
      return
    }
    const messageText = buildWorkingText(item)
    if (!messageText) {
      setFeedback('No advisory text found to send for this item.')
      return
    }

    setSendingId(item.id)
    setFeedback(null)
    try {
      const previewEmailHtml = await buildPreviewEmailHtml(item)
      await approvalsApi.create({
        notification_id: item.id,
        item_type: 'advisory',
        approver_user_id: Number(selectedApproverUserId),
        title: item.heading || item.email_subject || `Advisory #${item.id}`,
        subject: item.email_subject || item.heading || `Advisory #${item.id}`,
        message_text: messageText,
        html_body: previewEmailHtml.trim() || undefined,
        recipient_emails: destination ? [destination] : [],
        recipient_group_ids: selectedGroupIds,
      })
      setDismissedAdvisoryIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]))
      void queryClient.invalidateQueries({ queryKey: ['send-advisories-notifications'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      void queryClient.invalidateQueries({ queryKey: ['approvals'] })
      setFeedback('Advisory sent for approval.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send advisory for approval.'
      setFeedback(message)
    } finally {
      setSendingId(null)
    }
  }

  const handleReject = async (item: Notification) => {
    if (!window.confirm('Reject and permanently remove this advisory?')) return
    setDeletingId(item.id)
    setFeedback(null)
    try {
      await notificationsApi.remove(item.id)
      setDismissedAdvisoryIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]))
      await queryClient.invalidateQueries({ queryKey: ['send-advisories-notifications'] })
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
      setFeedback('Advisory rejected and removed.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reject advisory.'
      setFeedback(message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="saved-page">
      <div className="send-advisories-top-row">
        <div className="saved-summary-line">
          {isFetching || loadingAlerts ? 'Loading advisories...' : `Pending advisories: ${advisories.length} | Priority alerts in window: ${priorityAlerts.length}`}
        </div>
        <div className="saved-actions-bar send-advisories-top-actions">
          <select
            className="approval-approver-select"
            value={selectedApproverUserId}
            onChange={(event) => setSelectedApproverUserId(event.target.value ? Number(event.target.value) : '')}
            aria-label="Select superadmin approver"
          >
            <option value="">Select approver</option>
            {superadmins.map((item) => (
              <option key={item.id} value={item.id}>{item.email}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary send-advisories-generate-btn"
            onClick={() => { void handleGenerateAdvisories() }}
            disabled={advisoryGenerationState.isRunning || loadingAlerts}
            title="Generate missing advisories from current priority alerts"
            aria-label="Generate missing advisories from current priority alerts"
          >
            {advisoryGenerationState.isRunning ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => { void handleGenerateAgain() }}
            disabled={advisoryGenerationState.isRunning || loadingAlerts}
            title="Generate again for all advisories in the selected time window"
            aria-label="Generate again for all advisories in the selected time window"
          >
            Generate Again
          </button>
          <span className="saved-selected-count">
            Template: {advisoryTemplate?.name || `${PREFERRED_ADVISORY_TEMPLATE_NAME} (not found)`}
          </span>
        </div>
      </div>
      {advisoryGenerationState.windowMinutes === sharedFeedTimeWindow && advisoryGenerationState.lastMessage
        ? <div className="compose-meta-note">{advisoryGenerationState.lastMessage}</div>
        : null}
      {feedback ? <div className="compose-meta-note">{feedback}</div> : null}

      <table className="saved-table">
        <thead>
          <tr>
            <th align="left" className="send-advisories-col-time">Time</th>
            <th align="left" className="send-advisories-col-heading">Event heading</th>
            <th align="left" className="send-advisories-col-email">Recipient Email</th>
            <th align="left" className="send-advisories-col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {advisories.map((item) => (
            <tr key={item.id}>
              <td className="send-advisories-col-time">{formatAppDateTime(item.updated_at, '—')}</td>
              <td className="send-advisories-col-heading">{item.heading || `Advisory #${item.id}`}</td>
              <td className="send-advisories-col-email">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
                  <input
                    className="insights-email-input"
                    type="text"
                    id={`recipient-email-${item.id}`}
                    name={`recipient_email_${item.id}`}
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    inputMode="email"
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                    readOnly={activeRecipientInputId !== item.id}
                    value={recipientById[item.id] || ''}
                    onFocus={() => setActiveRecipientInputId(item.id)}
                    onBlur={() => {
                      setActiveRecipientInputId((current) => (current === item.id ? null : current))
                    }}
                    onChange={(event) => {
                      const next = event.target.value
                      setRecipientById((prev) => ({ ...prev, [item.id]: next }))
                      setSelectedGroupIdsById((prev) => ({ ...prev, [item.id]: [] }))
                    }}
                    placeholder="name@company.com"
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setGroupMenuForId((current) => (current === item.id ? null : item.id))}
                    title="Send to email group"
                    aria-label="Send to email group"
                  >
                    <Users size={14} />
                  </button>
                  {groupMenuForId === item.id ? (
                    <div style={{ position: 'absolute', top: '108%', right: 0, minWidth: 230, background: menuSurfaceBg, border: `1px solid ${menuBorder}`, borderRadius: 8, zIndex: 20, maxHeight: 220, overflow: 'auto', boxShadow: '0 8px 20px rgba(15,23,42,0.25)' }}>
                      {emailGroups.map((group) => (
                        <button
                          key={group.id}
                          type="button"
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            border: 0,
                            borderRadius: 0,
                            padding: '9px 10px',
                            cursor: 'pointer',
                            backgroundColor: (selectedGroupIdsById[item.id] || []).includes(group.id) ? '#b7ddc7' : rowDefaultBg,
                            color: (selectedGroupIdsById[item.id] || []).includes(group.id) ? '#166534' : rowDefaultText,
                            fontWeight: (selectedGroupIdsById[item.id] || []).includes(group.id) ? 700 : 500,
                          }}
                          onClick={() => {
                            setSelectedGroupIdsById((prev) => {
                              const current = prev[item.id] || []
                              const next = current.includes(group.id)
                                ? current.filter((id) => id !== group.id)
                                : [...current, group.id]
                              return { ...prev, [item.id]: next }
                            })
                            setRecipientById((prev) => ({ ...prev, [item.id]: '' }))
                          }}
                        >
                          {group.name}
                        </button>
                      ))}
                      {emailGroups.length === 0 ? (
                        <div style={{ padding: 8, fontSize: 12, color: '#64748b' }}>No email groups found</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {(selectedGroupIdsById[item.id] || []).length > 0 ? (
                  <div style={{ marginTop: 4, fontSize: 11, color: '#475569' }}>
                    Groups: {emailGroups.filter((group) => (selectedGroupIdsById[item.id] || []).includes(group.id)).map((group) => group.name).join(', ')}
                  </div>
                ) : null}
              </td>
              <td className="send-advisories-actions-cell send-advisories-col-actions">
                <div className="history-row-actions-inner send-advisories-actions">
                  <button
                    type="button"
                    className="btn-primary send-advisories-send-btn"
                    onClick={() => { void handleApprove(item) }}
                    disabled={sendingId === item.id || deletingId === item.id}
                    title="Send for approval"
                    aria-label={sendingId === item.id ? 'Sending advisory for approval' : 'Send advisory for approval'}
                  >
                    {sendingId === item.id ? <Loader2 size={14} className="spin" /> : <Send size={16} strokeWidth={2.4} className="send-advisories-send-icon" />}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary send-advisories-icon-btn send-advisories-view-btn"
                    onClick={() => setPreviewItem(item)}
                    disabled={sendingId === item.id || deletingId === item.id}
                    title="Preview advisory email"
                    aria-label="Preview advisory email"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn-secondary send-advisories-icon-btn send-advisories-edit-btn"
                    onClick={() => navigate(`/compose?id=${item.id}`)}
                    disabled={sendingId === item.id || deletingId === item.id}
                    title="Edit in compose"
                    aria-label="Edit in compose"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-danger-action send-advisories-icon-btn send-advisories-delete-btn"
                    onClick={() => { void handleReject(item) }}
                    disabled={sendingId === item.id || deletingId === item.id}
                    title="Reject and remove"
                    aria-label="Reject and remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!isFetching && advisories.length === 0 ? (
            <tr>
              <td colSpan={4} className="history-empty">
                No generated advisories available.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {previewItem ? (
        <div className="send-advisories-preview-backdrop" role="dialog" aria-modal="true" aria-label="Advisory email preview">
          <div className="send-advisories-preview-modal">
            <div className="send-advisories-preview-head">
              <div className="send-advisories-preview-title">
                {previewItem.email_subject || previewItem.heading || `Advisory #${previewItem.id}`}
              </div>
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
            <iframe
              ref={previewFrameRef}
              title="Advisory email preview"
              className="send-advisories-preview-frame"
              sandbox=""
              referrerPolicy="no-referrer"
              onLoad={() => normalizeEmailPreviewFrame(previewFrameRef.current)}
              srcDoc={
                isRenderingPreview
                  ? '<div style="padding:24px;font-family:Segoe UI,Arial,sans-serif;">Preparing advisory preview and impact map...</div>'
                  : previewHtml || buildFallbackPreviewHtml(previewItem)
              }
            />
            {previewError ? <div className="compose-meta-note">Preview map render failed: {previewError}</div> : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
