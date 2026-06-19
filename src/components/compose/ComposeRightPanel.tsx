/**
 * Module: Composerightpanel
 * Purpose: Core module responsible for Composerightpanel concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

import { useEffect, useMemo, useState, type RefObject } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, RefreshCw, Save as SaveIcon, Users } from 'lucide-react'
import { EmailRichEditor } from './EmailRichEditor'
import type { Template } from '../../types/template'
import type { GenerationPhase } from '../../pages/Compose'
import { emailGroupsApi } from '../../api/emailGroups'
import { approvalsApi } from '../../api/approvals'
import { notificationsApi } from '../../api/notifications'
import { normalizeEmailPreviewFrame } from '../../utils/emailPreviewFrame'
import {
  IMPACT_MAP_PLACEHOLDER,
  injectBrowserImpactMapIntoEmailHtml,
  mapPreviewErrorHtml,
} from '../../utils/emailPreviewImpactMap'
import type { ImpactMapPayload } from '../../utils/renderImpactMapImage'

interface ComposeRightPanelProps {
  advisoryRef: RefObject<HTMLElement>
  notificationId: number | null
  fields: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  templates: Template[]
  onTemplateChange: (id: number | null) => void
  onGenerate: () => Promise<void>
  generating?: boolean
  generationPhase?: GenerationPhase
  generateError?: string | null
  lastGeneratedTemplateName?: string | null
  onShowToast: (message: string) => void
  saveStatus?: 'save' | 'saving' | 'saved'
  saveLabel?: string
  onSave?: (overrides?: Record<string, unknown>) => Promise<void> | void
  onRefreshPreview?: (overrides?: Record<string, unknown>) => Promise<void> | void
  showTemplatePanel?: boolean
  showAdvisoryPanel?: boolean
  className?: string
}

type OutputMode = 'text' | 'editor' | 'email'
const CUSTOM_EMAIL_TEMPLATE_MARKER = 'OSINT_EMAIL_TEMPLATE_CUSTOM'

export function ComposeRightPanel({
  advisoryRef,
  notificationId,
  fields,
  onChange,
  templates,
  onTemplateChange,
  onGenerate,
  generating,
  generationPhase = 'idle',
  generateError,
  lastGeneratedTemplateName,
  onShowToast,
  saveStatus = 'save',
  saveLabel = 'Save draft',
  onSave,
  onRefreshPreview,
  showTemplatePanel = true,
  showAdvisoryPanel = true,
  className,
}: ComposeRightPanelProps) {
  const queryClient = useQueryClient()
  const [outputMode, setOutputMode] = useState<OutputMode>('text')
  const [editorHtml, setEditorHtml] = useState('')
  const [editorHasUserChanges, setEditorHasUserChanges] = useState(false)
  const [emailDestination, setEmailDestination] = useState('')
  const [emailGroupMenuOpen, setEmailGroupMenuOpen] = useState(false)
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([])
  const [selectedApproverUserId, setSelectedApproverUserId] = useState<number | ''>('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [savingOutputChanges, setSavingOutputChanges] = useState(false)
  const [emailSendFeedback, setEmailSendFeedback] = useState<string | null>(null)
  const [resolvedEmailPreviewHtml, setResolvedEmailPreviewHtml] = useState('')
  const [renderingBrowserMapPreview, setRenderingBrowserMapPreview] = useState(false)
  const [browserMapPreviewError, setBrowserMapPreviewError] = useState<string | null>(null)
  const { data: emailGroups = [] } = useQuery({
    queryKey: ['email-groups-compose'],
    queryFn: () => emailGroupsApi.list(true),
  })
  const { data: superadmins = [] } = useQuery({
    queryKey: ['approval-superadmins-compose'],
    queryFn: approvalsApi.listSuperadmins,
  })

  const phaseLabelMap: Record<GenerationPhase, string> = {
    idle: 'Ready to generate output',
    preparing: 'Preparing request',
    'applying-template': 'Applying template',
    generating: 'Generating output',
    finalizing: 'Finalizing output',
    success: 'Completed',
    error: 'Failed',
  }

  const phaseOrder: GenerationPhase[] = ['preparing', 'applying-template', 'generating', 'finalizing']
  const activeIndex = phaseOrder.indexOf(generationPhase)

  const activeOutputKey = (fields.final_text as string) ? 'final_text' : ((fields.edited_text as string) ? 'edited_text' : 'generated_text')
  const outputText = (fields[activeOutputKey] as string) || ''
  const emailPreviewHtml = (fields.channel_email_text as string) || ''
  const tagsJson = (fields.tags_json as string) || ''
  const geographyJson = (fields.geography_json as string) || ''
  const emailSubject = ((fields.email_subject as string) || '').trim()
  const defaultHeading = ((fields.heading as string) || '').trim()
  const hasOutput = Boolean(outputText.trim())
  const wordCount = outputText.trim().split(/\s+/).filter(Boolean).length
  const fallbackUsed = Boolean(fields.llm_fallback_used)
  const fallbackReason = (fields.llm_fallback_reason as string) || ''
  const requestedProvider = (fields.llm_requested_provider as string) || ''
  const activeProvider = (fields.llm_provider as string) || ''
  const activeModel = (fields.llm_model as string) || ''
  const shouldShowGenerationDetails = Boolean(generating) || generationPhase !== 'idle' || Boolean(generateError)
  const { data: emailPreviewResponse, isFetching: isFetchingEmailPreviewShell } = useQuery({
    queryKey: ['notification-email-preview', notificationId, outputText, tagsJson, geographyJson],
    queryFn: () => notificationsApi.getEmailPreview(notificationId as number, false),
    enabled: Boolean(notificationId) && Boolean(outputText.trim()),
    staleTime: 30000,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    setEditorHtml(emailPreviewHtml || '')
    setEditorHasUserChanges(false)
  }, [emailPreviewHtml])

  const modeButtonClass = (mode: OutputMode) => `compose-pill${outputMode === mode ? ' is-active' : ''}`
  const editorDirty = editorHasUserChanges
  const emailPreviewShellHtml = emailPreviewResponse?.html || ''
  const hasCustomEmailPreview = emailPreviewHtml.includes(CUSTOM_EMAIL_TEMPLATE_MARKER)
  const isFetchingMapPreview = isFetchingEmailPreviewShell || renderingBrowserMapPreview
  const mapPreviewHtml = resolvedEmailPreviewHtml || emailPreviewShellHtml
  const savedEmailPreviewDocument = hasCustomEmailPreview
    ? emailPreviewHtml
    : (mapPreviewHtml || emailPreviewHtml || '')
  const emailPreviewDocument = editorDirty
    ? (editorHtml || savedEmailPreviewDocument || '')
    : (savedEmailPreviewDocument || editorHtml || '')
  const liveMapPreviewUnavailable =
    outputMode === 'email'
    && !editorDirty
    && !hasCustomEmailPreview
    && (renderingBrowserMapPreview || Boolean(browserMapPreviewError))
  const shouldRenderAdvisoryPanel = showAdvisoryPanel && hasOutput
  const panelClassName = ['compose-generation-stack', 'compose-generation-layout', className].filter(Boolean).join(' ')
  const isLightTheme = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light'
  const menuSurfaceBg = isLightTheme ? '#ffffff' : '#0f172a'
  const menuBorder = isLightTheme ? '#cbd5e1' : '#334155'
  const rowDefaultBg = isLightTheme ? '#f3f4f6' : '#1f2937'
  const rowDefaultText = isLightTheme ? '#111827' : '#e5e7eb'
  const selectedGroupNames = useMemo(
    () => emailGroups.filter((group) => selectedGroupIds.includes(group.id)).map((group) => group.name),
    [emailGroups, selectedGroupIds],
  )

  useEffect(() => {
    if (editorDirty || hasCustomEmailPreview || !mapPreviewHtml) {
      return
    }
    setEditorHtml(mapPreviewHtml)
  }, [editorDirty, hasCustomEmailPreview, mapPreviewHtml])

  useEffect(() => {
    if (
      editorDirty
      || hasCustomEmailPreview
      || !emailPreviewShellHtml
      || !notificationId
    ) {
      setRenderingBrowserMapPreview(false)
      setBrowserMapPreviewError(null)
      setResolvedEmailPreviewHtml('')
      return
    }

    let cancelled = false
    const resolveBrowserMapPreview = async () => {
      if (!emailPreviewShellHtml.includes(IMPACT_MAP_PLACEHOLDER)) {
        setResolvedEmailPreviewHtml(emailPreviewShellHtml)
        setBrowserMapPreviewError(null)
        return
      }

      setRenderingBrowserMapPreview(true)
      setBrowserMapPreviewError(null)
      setResolvedEmailPreviewHtml('')
      try {
        const payload = (await notificationsApi.getImpactMapPayload(notificationId)) as ImpactMapPayload
        const htmlWithMap = await injectBrowserImpactMapIntoEmailHtml(emailPreviewShellHtml, payload)
        if (!cancelled) {
          setResolvedEmailPreviewHtml(htmlWithMap)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown map rendering error.'
        if (!cancelled) {
          setBrowserMapPreviewError(message)
          setResolvedEmailPreviewHtml(emailPreviewShellHtml.replace(IMPACT_MAP_PLACEHOLDER, mapPreviewErrorHtml(message)))
        }
      } finally {
        if (!cancelled) {
          setRenderingBrowserMapPreview(false)
        }
      }
    }

    void resolveBrowserMapPreview()
    return () => {
      cancelled = true
    }
  }, [editorDirty, emailPreviewShellHtml, geographyJson, hasCustomEmailPreview, notificationId, outputText, tagsJson])

  const handleSaveAndRefreshPreview = async () => {
    if (!onRefreshPreview) {
      onShowToast('Preview refresh is not available for this draft')
      return
    }
    const overrides: Record<string, unknown> = {}
    if (outputMode === 'editor') {
      if (isFetchingEmailPreviewShell || renderingBrowserMapPreview) {
        onShowToast('Wait for the live map snapshot to finish before saving editor changes')
        return
      }
      if (browserMapPreviewError) {
        onShowToast('Live map snapshot failed; fix the map preview before saving editor changes')
        return
      }
      const htmlToSave = (editorHtml || mapPreviewHtml || emailPreviewDocument).trim()
      overrides.channel_email_text = htmlToSave
      onChange('channel_email_text', htmlToSave)
    } else if (outputMode === 'text') {
      overrides[activeOutputKey] = outputText
    }
    try {
      setSavingOutputChanges(true)
      await onRefreshPreview(overrides)
      if (outputMode === 'editor') {
        setEditorHasUserChanges(false)
      }
      if (notificationId) {
        await queryClient.invalidateQueries({ queryKey: ['notification-email-preview', notificationId] })
      }
      onShowToast(outputMode === 'editor' ? 'Email editor changes applied' : 'Content applied and email preview refreshed')
      if (outputMode === 'text') {
        setOutputMode('email')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save changes'
      onShowToast(message)
    } finally {
      setSavingOutputChanges(false)
    }
  }

  if (!showTemplatePanel && !shouldRenderAdvisoryPanel) {
    return null
  }

  const ensureCurrentEmailSavedForApproval = async (): Promise<boolean> => {
    if (!editorDirty) return true
    if (!onRefreshPreview) {
      return true
    }
    if (isFetchingEmailPreviewShell || renderingBrowserMapPreview) {
      onShowToast('Wait for the live map snapshot to finish before requesting approval')
      return false
    }
    if (browserMapPreviewError) {
      onShowToast('Live map snapshot failed; fix the map preview before requesting approval')
      return false
    }
    const htmlToSave = (editorHtml || mapPreviewHtml || emailPreviewDocument).trim()
    if (!htmlToSave) return true
    try {
      setSavingOutputChanges(true)
      onChange('channel_email_text', htmlToSave)
      await onRefreshPreview({ channel_email_text: htmlToSave })
      setEditorHasUserChanges(false)
      if (notificationId) {
        void queryClient.invalidateQueries({ queryKey: ['notification-email-preview', notificationId] })
      }
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save email editor changes'
      setEmailSendFeedback(message)
      onShowToast(message)
      return false
    } finally {
      setSavingOutputChanges(false)
    }
  }

  const handleSendEmail = async () => {
    if (selectedGroupIds.length > 0) {
      await sendToEmailGroups(selectedGroupIds)
      return
    }
    const destination = emailDestination.trim()
    if (!notificationId) {
      onShowToast('Generate content first')
      return
    }
    if (liveMapPreviewUnavailable) {
      onShowToast(renderingBrowserMapPreview ? 'Wait for the live map snapshot to finish' : 'Live map snapshot failed')
      return
    }
    if (!selectedApproverUserId) {
      onShowToast('Select a superadmin approver')
      setEmailSendFeedback('Select a superadmin approver before requesting approval.')
      return
    }
    if (!destination) {
      onShowToast('Enter a recipient email')
      return
    }

    setSendingEmail(true)
    setEmailSendFeedback(null)
    try {
      const savedForApproval = await ensureCurrentEmailSavedForApproval()
      if (!savedForApproval) return
      await approvalsApi.create({
        notification_id: notificationId,
        item_type: 'advisory',
        approver_user_id: Number(selectedApproverUserId),
        title: defaultHeading || emailSubject || `Advisory #${notificationId}`,
        subject: emailSubject || defaultHeading || undefined,
        message_text: outputText,
        recipient_emails: [destination],
        recipient_group_ids: [],
      })
      setEmailSendFeedback(`Approval request sent for ${destination}`)
      onShowToast('Sent for approval')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send email'
      setEmailSendFeedback(message)
    } finally {
      setSendingEmail(false)
    }
  }

  const sendToEmailGroups = async (groupIds: number[]) => {
    const selectedGroups = emailGroups.filter((item) => groupIds.includes(item.id))
    if (!selectedGroups.length) return
    if (!notificationId) {
      onShowToast('Generate content first')
      return
    }
    if (liveMapPreviewUnavailable) {
      onShowToast(renderingBrowserMapPreview ? 'Wait for the live map snapshot to finish' : 'Live map snapshot failed')
      return
    }
    if (!selectedApproverUserId) {
      onShowToast('Select a superadmin approver')
      setEmailSendFeedback('Select a superadmin approver before requesting approval.')
      return
    }
    const uniqueByLower = new Map<string, string>()
    for (const destination of selectedGroups.flatMap((group) =>
      (group.members || [])
        .filter((member) => member.active)
        .map((member) => String(member.email || '').trim())
        .filter(Boolean),
    )) {
      const key = destination.toLowerCase()
      if (!uniqueByLower.has(key)) {
        uniqueByLower.set(key, destination)
      }
    }
    const destinations = Array.from(uniqueByLower.values())
    if (!destinations.length) {
      setEmailSendFeedback('No active emails found in selected groups.')
      return
    }
    setSendingEmail(true)
    setEmailSendFeedback(null)
    setEmailGroupMenuOpen(false)
    try {
      const savedForApproval = await ensureCurrentEmailSavedForApproval()
      if (!savedForApproval) return
      await approvalsApi.create({
        notification_id: notificationId,
        item_type: 'advisory',
        approver_user_id: Number(selectedApproverUserId),
        title: defaultHeading || emailSubject || `Advisory #${notificationId}`,
        subject: emailSubject || defaultHeading || undefined,
        message_text: outputText,
        recipient_emails: [],
        recipient_group_ids: groupIds,
      })
      setEmailSendFeedback(`Approval request sent to ${selectedGroups.length} group(s) (${destinations.length} recipients)`)
      onShowToast('Sent for approval')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send group email'
      setEmailSendFeedback(message)
    } finally {
      setSendingEmail(false)
    }
  }

  const handleDownloadPdf = () => {
    const printableHtml = (editorDirty ? editorHtml : emailPreviewDocument).trim()
    if (!printableHtml) {
      onShowToast('Generate content first')
      return
    }
    const printWindow = window.open('', '_blank', 'width=960,height=900')
    if (!printWindow) {
      onShowToast('Allow pop-ups to download PDF')
      return
    }
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>IHCL Advisory PDF</title>
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
      console.error('[impact-map] PDF print image wait timed out; printing current document state')
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
    <section className={panelClassName}>
      {showTemplatePanel ? (
        <div className="compose-panel compose-template-panel compose-template-panel--compact">
          <div className="compose-panel-heading">
            <div>
              <h2>Generate Advisory</h2>
            </div>
          </div>

          <div className="compose-inline-actions compose-template-controls-row">
            <label className="compose-template-select">
              Template
              <select
                value={fields.template_id ? String(fields.template_id) : ''}
                onChange={(e) => onTemplateChange(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Select template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </label>
            <div className="compose-sticky-actions compose-sticky-actions-end">
              <button className="btn-primary" onClick={() => void onGenerate()} disabled={Boolean(generating)}>
                {generating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>

          {lastGeneratedTemplateName ? (
            <div className="compose-meta-note">Last generated using: {lastGeneratedTemplateName}</div>
          ) : null}

          {shouldShowGenerationDetails ? (
            <div className={`processing-panel ${generating ? 'is-active' : ''}`}>
              <div className="processing-row">
                <span className="spinner-dot" />
                <span>{phaseLabelMap[generationPhase]}</span>
              </div>
              <div className="compose-phase-list" aria-label="Generation progress">
                {phaseOrder.map((phase, index) => {
                  const isDone = generationPhase === 'success' || (activeIndex >= 0 && index < activeIndex)
                  const isActive = generationPhase === phase
                  const stepLabel = phase === 'applying-template' ? 'Template applied' : phaseLabelMap[phase]
                  return (
                    <div key={phase} className={`compose-phase-item${isDone ? ' is-done' : ''}${isActive ? ' is-active' : ''}`}>
                      <span className="compose-phase-dot" aria-hidden="true">
                        {isDone ? '✓' : index + 1}
                      </span>
                      <span>{stepLabel}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {generateError ? <div className="compose-alert-error">{generateError}</div> : null}

          {fallbackUsed ? (
            <div className="runtime-fallback-notice">
              <div className="compose-fallback-title">Provider fallback used</div>
              <div>
                Requested {requestedProvider || 'configured provider'}, served by {activeProvider || 'azure_openai'}{activeModel ? ` (${activeModel})` : ''}.
              </div>
              {fallbackReason ? (
                <div className="compose-fallback-detail">{fallbackReason}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {shouldRenderAdvisoryPanel ? (
        <section ref={advisoryRef} className="compose-panel compose-advisory-panel">
          <div className="compose-panel-heading">
            <div>
              <h2>Generated Advisory</h2>
              <p className="compose-panel-copy">Review, edit, copy, download, or send the generated advisory.</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="compose-word-count">{wordCount} words</div>
              {onSave ? (
                <button
                  type="button"
                  className={`btn-secondary compose-header-save-button${saveStatus === 'saved' ? ' is-saved' : ''}${saveStatus === 'saving' ? ' is-saving' : ''}`}
                  disabled={saveStatus === 'saving'}
                  onClick={() => { void onSave() }}
                  aria-label={saveLabel}
                  title={saveLabel}
                >
                  {saveStatus === 'saving' ? (
                    <Loader2 size={16} className="compose-header-save-spinner" aria-hidden="true" />
                  ) : saveStatus === 'saved' ? (
                    <Check size={16} aria-hidden="true" />
                  ) : (
                    <SaveIcon size={16} aria-hidden="true" />
                  )}
                </button>
              ) : null}
            </div>
          </div>

          {Boolean(fields.edited_text || fields.final_text) ? (
            <div className="compose-info-note">
              Reviewer edits are active in this draft.
            </div>
          ) : null}

          <label className="compose-label-stack">
            Email Subject
            <input
              value={(fields.email_subject as string) || ''}
              onChange={(e) => onChange('email_subject', e.target.value)}
              placeholder={defaultHeading ? `Defaults to heading: ${defaultHeading}` : 'Enter subject line'}
            />
          </label>

          <div className="compose-pill-tabs">
            <button type="button" className={modeButtonClass('text')} onClick={() => setOutputMode('text')}>
              Text
            </button>
            <button type="button" className={modeButtonClass('editor')} onClick={() => setOutputMode('editor')}>
              Editor
            </button>
            <button type="button" className={modeButtonClass('email')} onClick={() => setOutputMode('email')}>
              Email Preview
            </button>
            <button type="button" className="compose-pill" onClick={handleDownloadPdf}>
              Download PDF
            </button>
            <button
              type="button"
              className="compose-pill compose-pill-icon"
              onClick={() => { void handleSaveAndRefreshPreview() }}
              disabled={!onRefreshPreview || saveStatus === 'saving' || savingOutputChanges}
              title={outputMode === 'editor' ? 'Apply email editor changes' : 'Apply content and refresh email preview'}
              aria-label={outputMode === 'editor' ? 'Apply email editor changes' : 'Apply content and refresh email preview'}
            >
              {saveStatus === 'saving' || savingOutputChanges ? <Loader2 size={14} className="spin" /> : outputMode === 'editor' ? <SaveIcon size={14} /> : <RefreshCw size={14} />}
            </button>
          </div>

          {outputMode === 'email' ? (
            <div className="compose-canvas-shell">
              <div className="compose-canvas compose-canvas-preview">
                {isFetchingMapPreview && !editorDirty ? (
                  <div className="compose-meta-note" style={{ padding: '10px 12px' }}>
                    {isFetchingEmailPreviewShell ? 'Loading email preview...' : 'Rendering live impact map snapshot...'}
                  </div>
                ) : null}
                {browserMapPreviewError && !editorDirty ? (
                  <div className="compose-alert-error" style={{ margin: '0 0 10px 0' }}>
                    Live map snapshot failed: {browserMapPreviewError}
                  </div>
                ) : null}
                <iframe
                  title="Email preview"
                  srcDoc={emailPreviewDocument || '<div style="padding:24px;font-family:Arial,sans-serif;">Generate and save to refresh the branded preview.</div>'}
                  className="compose-email-iframe"
                  sandbox=""
                  referrerPolicy="no-referrer"
                  onLoad={(event) => normalizeEmailPreviewFrame(event.currentTarget)}
                />
              </div>
            </div>
          ) : outputMode === 'editor' ? (
            <div className="compose-editor-output">
              <EmailRichEditor
                content={editorHtml || mapPreviewHtml || emailPreviewHtml}
                onChange={(html) => {
                  setEditorHtml(html)
                  setEditorHasUserChanges(true)
                }}
              />
              <div className="compose-editor-meta">
                <span>Edit the branded email directly here.</span>
                <span>{editorDirty ? 'Unsaved email editor changes' : 'Editor synced with saved email layout'}</span>
              </div>
            </div>
          ) : (
            <div className="compose-canvas-shell">
              <textarea
                className="compose-text-output"
                value={outputText}
                onChange={(e) => onChange(activeOutputKey, e.target.value)}
                rows={14}
                placeholder="Generated advisory text will appear here..."
              />
            </div>
          )}

          <div className="compose-output-actions">
            <div className="compose-email-card">
              <div className="compose-email-card-title">SMTP Email</div>
              <div className="compose-email-send-grid">
                <input
                  className="compose-email-input compose-email-recipient-input"
                  value={emailDestination}
                  onChange={(e) => {
                    setEmailDestination(e.target.value)
                    setSelectedGroupIds([])
                  }}
                  placeholder="Recipient email address"
                />
                <div className="compose-email-group-trigger" style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setEmailGroupMenuOpen((open) => !open)}
                    disabled={sendingEmail || !notificationId}
                    title="Send to email group"
                    aria-label="Send to email group"
                  >
                    <Users size={14} />
                  </button>
                  {emailGroupMenuOpen ? (
                    <div style={{ position: 'absolute', top: '110%', right: 0, minWidth: 240, background: menuSurfaceBg, border: `1px solid ${menuBorder}`, borderRadius: 8, zIndex: 20, maxHeight: 220, overflow: 'auto', boxShadow: '0 8px 20px rgba(15,23,42,0.25)' }}>
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
                            backgroundColor: selectedGroupIds.includes(group.id) ? '#b7ddc7' : rowDefaultBg,
                            color: selectedGroupIds.includes(group.id) ? '#166534' : rowDefaultText,
                            fontWeight: selectedGroupIds.includes(group.id) ? 700 : 500,
                          }}
                          onClick={() => {
                            setSelectedGroupIds((prev) =>
                              prev.includes(group.id) ? prev.filter((id) => id !== group.id) : [...prev, group.id],
                            )
                            setEmailDestination('')
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
                <select
                  className="approval-approver-select compose-approver-select"
                  value={selectedApproverUserId}
                  onChange={(event) => setSelectedApproverUserId(event.target.value ? Number(event.target.value) : '')}
                  disabled={sendingEmail || !notificationId}
                  aria-label="Select superadmin approver"
                >
                  <option value="">Approver</option>
                  {superadmins.map((item) => (
                    <option key={item.id} value={item.id}>{item.email}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-primary compose-email-approval-button"
                  onClick={() => void handleSendEmail()}
                  disabled={sendingEmail || !notificationId || liveMapPreviewUnavailable}
                >
                  {sendingEmail ? 'Requesting...' : 'Send for Approval'}
                </button>
              </div>
              <div className="compose-email-card-copy">
                Sends the current preview and selected recipients to a superadmin for approval.
              </div>
              {selectedGroupNames.length > 0 ? (
                <div className="compose-meta-note">Selected groups: {selectedGroupNames.join(', ')}</div>
              ) : null}
              {emailSendFeedback ? (
                <div className={`compose-email-feedback${emailSendFeedback.startsWith('Approval request sent') ? ' is-success' : ' is-error'}`}>
                  {emailSendFeedback}
                </div>
              ) : null}
            </div>

            <div className="compose-sticky-actions">
              <div className="compose-output-buttons">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(outputText)
                    onShowToast('Copied to clipboard')
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  )
}

