/**
 * Module: Composerightpanel
 * Purpose: Core module responsible for Composerightpanel concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Users } from 'lucide-react'
import type { Template } from '../../types/template'
import type { GenerationPhase } from '../../pages/Compose'
import { datasurfrApi } from '../../api/datasurfr'
import { emailGroupsApi } from '../../api/emailGroups'
import { approvalsApi } from '../../api/approvals'
import { notificationsApi } from '../../api/notifications'
import type { ApprovalRequest } from '../../types/approval'
import type { DatasurfrMapProperty } from '../../types/datasurfr'
import { normalizeEmailPreviewFrame } from '../../utils/emailPreviewFrame'
import {
  IMPACT_MAP_PLACEHOLDER,
  injectBrowserImpactMapIntoEmailHtml,
  mapPreviewErrorHtml,
} from '../../utils/emailPreviewImpactMap'
import type { ImpactMapPayload } from '../../utils/renderImpactMapImage'
import { AdvisoryRichTextEditor } from './AdvisoryRichTextEditor'

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
  onRefreshPreview?: (overrides?: Record<string, unknown>) => Promise<void> | void
  showTemplatePanel?: boolean
  showAdvisoryPanel?: boolean
  className?: string
}

type OutputMode = 'text' | 'email'
const CUSTOM_EMAIL_TEMPLATE_MARKER = 'OSINT_EMAIL_TEMPLATE_CUSTOM'
const STANDARD_EMAIL_TEMPLATE_MARKER_RE = /<!--\s*OSINT_EMAIL_TEMPLATE_V\d+\s*-->/

function markEmailHtmlAsCustom(html: string): string {
  const value = html.trim()
  if (!value) return value
  if (value.includes(CUSTOM_EMAIL_TEMPLATE_MARKER)) return value
  if (STANDARD_EMAIL_TEMPLATE_MARKER_RE.test(value)) {
    return value.replace(STANDARD_EMAIL_TEMPLATE_MARKER_RE, `<!-- ${CUSTOM_EMAIL_TEMPLATE_MARKER} -->`)
  }
  return `<!-- ${CUSTOM_EMAIL_TEMPLATE_MARKER} -->\n${value}`
}

type PropertyEmailSuggestion = {
  email: string
  label: string
}

function normalizePropertyName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function splitEmails(value?: string | null): string[] {
  return String(value || '')
    .split(/[;,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function uniqueEmails(values: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    const email = value.trim()
    if (!email || !isLikelyEmail(email)) continue
    const key = normalizeEmail(email)
    if (seen.has(key)) continue
    seen.add(key)
    output.push(email)
  }
  return output
}

function parseTagsJson(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  return typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function propertyEmailSuggestions(property: DatasurfrMapProperty): PropertyEmailSuggestion[] {
  const propertyName = String(property.property_name || '').trim()
  const suggestions: PropertyEmailSuggestion[] = []
  for (const email of splitEmails(property.gm_email)) {
    suggestions.push({ email, label: `GM - ${propertyName}` })
  }
  for (const email of splitEmails(property.sm_email)) {
    suggestions.push({ email, label: `SM - ${propertyName}` })
  }
  return suggestions
}

function pointEmailSuggestions(point: Record<string, unknown>): PropertyEmailSuggestion[] {
  const propertyName = String(point.name || point.property_name || '').trim()
  const suggestions: PropertyEmailSuggestion[] = []
  for (const email of splitEmails(point.gm_email as string | null | undefined)) {
    suggestions.push({ email, label: `GM - ${propertyName}` })
  }
  for (const email of splitEmails(point.sm_email as string | null | undefined)) {
    suggestions.push({ email, label: `SM - ${propertyName}` })
  }
  if (Array.isArray(point.contact_emails)) {
    for (const email of point.contact_emails.map((item) => String(item || '').trim())) {
      suggestions.push({ email, label: propertyName ? `Mapped contact - ${propertyName}` : 'Mapped contact' })
    }
  }
  return suggestions
}

function uniqueEmailSuggestions(values: PropertyEmailSuggestion[]): PropertyEmailSuggestion[] {
  const seen = new Set<string>()
  const output: PropertyEmailSuggestion[] = []
  for (const item of values) {
    const email = item.email.trim()
    if (!email || !isLikelyEmail(email)) continue
    const key = normalizeEmail(email)
    if (seen.has(key)) continue
    seen.add(key)
    output.push({ email, label: item.label })
  }
  return output
}

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
  onRefreshPreview,
  showTemplatePanel = true,
  showAdvisoryPanel = true,
  className,
}: ComposeRightPanelProps) {
  const queryClient = useQueryClient()
  const [outputMode, setOutputMode] = useState<OutputMode>('text')
  const [draftOutputText, setDraftOutputText] = useState<string | null>(null)
  const [textEditorHasUserChanges, setTextEditorHasUserChanges] = useState(false)
  const [emailDestination, setEmailDestination] = useState('')
  const [selectedRecipientEmails, setSelectedRecipientEmails] = useState<string[]>([])
  const [emailGroupMenuOpen, setEmailGroupMenuOpen] = useState(false)
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([])
  const [selectedApproverUserId, setSelectedApproverUserId] = useState<number | ''>('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [savingOutputChanges, setSavingOutputChanges] = useState(false)
  const [emailSendFeedback, setEmailSendFeedback] = useState<string | null>(null)
  const [resolvedEmailPreviewHtml, setResolvedEmailPreviewHtml] = useState('')
  const [renderingBrowserMapPreview, setRenderingBrowserMapPreview] = useState(false)
  const [browserMapPreviewError, setBrowserMapPreviewError] = useState<string | null>(null)
  const previousAutoRecipientEmailsRef = useRef<string[]>([])
  const textAutosaveFailureRef = useRef(false)
  const textEditorFocusedRef = useRef(false)
  const draftOutputTextRef = useRef('')
  const lastPersistedOutputTextRef = useRef('')
  const hydratedNotificationIdRef = useRef<number | null | undefined>(undefined)
  const { data: mapProperties = [] } = useQuery({
    queryKey: ['map-view-properties'],
    queryFn: () => datasurfrApi.listMapProperties(),
    staleTime: 5 * 60 * 1000,
  })
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
  const editorText = draftOutputText ?? outputText
  const textSaveKey = (fields.final_text as string) ? 'final_text' : 'edited_text'
  const emailPreviewHtml = (fields.channel_email_text as string) || ''
  const tagsJson = (fields.tags_json as string) || ''
  const geographyJson = (fields.geography_json as string) || ''
  const emailSubject = ((fields.email_subject as string) || '').trim()
  const defaultHeading = ((fields.heading as string) || '').trim()
  const hasOutput = Boolean(editorText.trim() || outputText.trim())
  const wordCount = editorText.trim().split(/\s+/).filter(Boolean).length
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
    const notificationChanged = hydratedNotificationIdRef.current !== notificationId
    if (notificationChanged || !textEditorHasUserChanges) {
      hydratedNotificationIdRef.current = notificationId
      setDraftOutputText(outputText)
      draftOutputTextRef.current = outputText
      lastPersistedOutputTextRef.current = outputText
      setTextEditorHasUserChanges(false)
    }
  }, [notificationId, outputText, textEditorHasUserChanges])

  const modeButtonClass = (mode: OutputMode) => `compose-pill${outputMode === mode ? ' is-active' : ''}`
  const editorDirty = textEditorHasUserChanges
  const emailPreviewShellHtml = emailPreviewResponse?.html || ''
  const isFetchingMapPreview = isFetchingEmailPreviewShell || renderingBrowserMapPreview
  const mapPreviewHtml = resolvedEmailPreviewHtml || emailPreviewShellHtml
  const savedEmailPreviewDocument = mapPreviewHtml || emailPreviewShellHtml || emailPreviewHtml || ''
  const emailPreviewDocument = savedEmailPreviewDocument || ''
  const liveEmailPreviewDocument = emailPreviewDocument
  const liveMapPreviewUnavailable =
    outputMode === 'email'
    && !editorDirty
    && (renderingBrowserMapPreview || Boolean(browserMapPreviewError))
  const shouldRenderAdvisoryPanel = showAdvisoryPanel && hasOutput
  const panelClassName = ['compose-generation-stack', 'compose-generation-layout', className].filter(Boolean).join(' ')
  const isLightTheme = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light'
  const menuSurfaceBg = isLightTheme ? '#ffffff' : '#0f172a'
  const menuBorder = isLightTheme ? '#cbd5e1' : '#334155'
  const rowDefaultBg = isLightTheme ? '#f3f4f6' : '#1f2937'
  const rowDefaultText = isLightTheme ? '#111827' : '#e5e7eb'

  const updateEditorText = (nextText: string) => {
    setDraftOutputText(nextText)
    draftOutputTextRef.current = nextText
    setTextEditorHasUserChanges(nextText !== lastPersistedOutputTextRef.current)
    textAutosaveFailureRef.current = false
  }

  const switchOutputMode = async (mode: OutputMode) => {
    if (mode === 'email' && textEditorHasUserChanges) {
      const saved = await persistTextEditorChanges()
      if (!saved) {
        return
      }
    } else if (mode === 'email' && notificationId) {
      await queryClient.invalidateQueries({ queryKey: ['notification-email-preview', notificationId] })
    }
    setOutputMode(mode)
  }

  const selectedGroupNames = useMemo(
    () => emailGroups.filter((group) => selectedGroupIds.includes(group.id)).map((group) => group.name),
    [emailGroups, selectedGroupIds],
  )
  const parsedTags = useMemo(() => parseTagsJson(fields.tags_json), [fields.tags_json])
  const mapPropertyByName = useMemo(() => {
    const byName = new Map<string, DatasurfrMapProperty>()
    for (const property of mapProperties) {
      const name = String(property.property_name || '').trim()
      if (!name) continue
      const key = normalizePropertyName(name)
      if (!byName.has(key)) {
        byName.set(key, property)
      }
    }
    return byName
  }, [mapProperties])
  const allPropertyEmailSuggestions = useMemo(
    () => uniqueEmailSuggestions(mapProperties.flatMap((property) => propertyEmailSuggestions(property))),
    [mapProperties],
  )
  const impactedPropertyNames = useMemo(() => {
    const fromAllTags = Array.isArray(parsedTags?.impacted_properties_all)
      ? parsedTags.impacted_properties_all.map((item) => String(item || '').trim()).filter(Boolean)
      : []
    if (fromAllTags.length) return Array.from(new Set(fromAllTags))
    const fromPreviewTags = Array.isArray(parsedTags?.impacted_properties_preview)
      ? parsedTags.impacted_properties_preview.map((item) => String(item || '').trim()).filter(Boolean)
      : []
    return Array.from(new Set(fromPreviewTags))
  }, [parsedTags])
  const impactedPropertyEmailSuggestions = useMemo(() => {
    const fromPoints = Array.isArray(parsedTags?.impacted_properties_points)
      ? parsedTags.impacted_properties_points
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
          .flatMap((point) => pointEmailSuggestions(point))
      : []
    const fromNames = impactedPropertyNames
      .map((name) => mapPropertyByName.get(normalizePropertyName(name)))
      .filter((property): property is DatasurfrMapProperty => Boolean(property))
      .flatMap((property) => propertyEmailSuggestions(property))
    return uniqueEmailSuggestions([...fromPoints, ...fromNames])
  }, [impactedPropertyNames, mapPropertyByName, parsedTags])
  const impactedRecipientEmails = useMemo(
    () => uniqueEmails(impactedPropertyEmailSuggestions.map((item) => item.email)),
    [impactedPropertyEmailSuggestions],
  )
  const impactedRecipientEmailSignature = useMemo(
    () => impactedRecipientEmails.map((email) => normalizeEmail(email)).sort().join('|'),
    [impactedRecipientEmails],
  )
  const filteredRecipientSuggestions = useMemo(() => {
    const selected = new Set(selectedRecipientEmails.map((email) => normalizeEmail(email)))
    const query = emailDestination.trim().toLowerCase()
    return allPropertyEmailSuggestions
      .filter((item) => !selected.has(normalizeEmail(item.email)))
      .filter((item) => {
        if (!query) return true
        return item.email.toLowerCase().includes(query) || item.label.toLowerCase().includes(query)
      })
      .slice(0, 8)
  }, [allPropertyEmailSuggestions, emailDestination, selectedRecipientEmails])
  const addRecipientEmails = (values: string[]) => {
    const nextEmails = uniqueEmails(values)
    if (!nextEmails.length) return
    setSelectedRecipientEmails((prev) => uniqueEmails([...prev, ...nextEmails]))
    setSelectedGroupIds([])
    setEmailDestination('')
  }
  const removeRecipientEmail = (email: string) => {
    const key = normalizeEmail(email)
    setSelectedRecipientEmails((prev) => prev.filter((item) => normalizeEmail(item) !== key))
  }

  useEffect(() => {
    const previousAutoKeys = new Set(previousAutoRecipientEmailsRef.current.map((email) => normalizeEmail(email)))
    setSelectedRecipientEmails((prev) => {
      const manuallySelected = prev.filter((email) => !previousAutoKeys.has(normalizeEmail(email)))
      return uniqueEmails([...impactedRecipientEmails, ...manuallySelected])
    })
    previousAutoRecipientEmailsRef.current = impactedRecipientEmails
  }, [impactedRecipientEmailSignature, impactedRecipientEmails])

  useEffect(() => {
    if (
      !emailPreviewShellHtml
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
  }, [emailPreviewShellHtml, geographyJson, notificationId, outputText, tagsJson])

  const persistTextEditorChanges = async (textOverride?: string): Promise<boolean> => {
    if (!notificationId && !onRefreshPreview) {
      return false
    }
    const textToSave = textOverride ?? draftOutputTextRef.current ?? editorText
    const overrides = { [textSaveKey]: textToSave }
    try {
      setSavingOutputChanges(true)
      if (notificationId) {
        const updated = await notificationsApi.update(notificationId, overrides)
        onChange(textSaveKey, (updated as unknown as Record<string, unknown>)[textSaveKey] ?? textToSave)
        queryClient.setQueryData(['notification', notificationId], updated)
      } else if (onRefreshPreview) {
        await onRefreshPreview(overrides)
      }
      lastPersistedOutputTextRef.current = textToSave
      if (draftOutputTextRef.current === textToSave) {
        setTextEditorHasUserChanges(false)
      }
      textAutosaveFailureRef.current = false
      if (notificationId) {
        await queryClient.invalidateQueries({ queryKey: ['notification-email-preview', notificationId] })
      }
      return true
    } catch (error) {
      if (!textAutosaveFailureRef.current) {
        const message = error instanceof Error ? error.message : 'Could not auto-save advisory text'
        onShowToast(message)
        textAutosaveFailureRef.current = true
      }
      return false
    } finally {
      setSavingOutputChanges(false)
    }
  }

  useEffect(() => {
    if (!textEditorHasUserChanges || (!notificationId && !onRefreshPreview)) return
    const timeout = window.setTimeout(() => {
      void persistTextEditorChanges()
    }, 350)
    return () => window.clearTimeout(timeout)
  }, [draftOutputText, notificationId, onRefreshPreview, textEditorHasUserChanges, textSaveKey])

  if (!showTemplatePanel && !shouldRenderAdvisoryPanel) {
    return null
  }

  const resolvePreviewHtmlWithBrowserMap = async (html: string): Promise<string> => {
    if (!notificationId || !html.includes(IMPACT_MAP_PLACEHOLDER)) {
      return html
    }
    try {
      const payload = (await notificationsApi.getImpactMapPayload(notificationId)) as ImpactMapPayload
      return await injectBrowserImpactMapIntoEmailHtml(html, payload)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown map rendering error.'
      return html.replace(IMPACT_MAP_PLACEHOLDER, mapPreviewErrorHtml(message))
    }
  }

  const getCurrentRenderedPreviewHtml = async (): Promise<string> => {
    if (textEditorHasUserChanges) {
      const saved = await persistTextEditorChanges()
      if (!saved) {
        throw new Error('Could not save latest advisory text before preparing preview.')
      }
    }

    if (notificationId) {
      const preview = await notificationsApi.getEmailPreview(notificationId, false)
      const previewHtml = String(preview.html || '').trim()
      if (previewHtml) {
        return resolvePreviewHtmlWithBrowserMap(previewHtml)
      }
    }

    return resolvePreviewHtmlWithBrowserMap((liveEmailPreviewDocument || emailPreviewDocument || '').trim())
  }

  const ensureCurrentEmailSavedForApproval = async (): Promise<string | null> => {
    try {
      const latestHtml = await getCurrentRenderedPreviewHtml()
      return latestHtml ? markEmailHtmlAsCustom(latestHtml) : latestHtml
    } catch {
      setEmailSendFeedback('Could not save latest advisory text before requesting approval.')
      return null
    }
  }

  const ensureApprovalReceivedCurrentHtml = async (
    createdApproval: ApprovalRequest,
    expectedHtml: string,
  ): Promise<void> => {
    const approvalForCheck = createdApproval.html_body ? createdApproval : await approvalsApi.get(createdApproval.id)
    const savedHtml = String(approvalForCheck.html_body || '').trim()
    if (savedHtml !== expectedHtml.trim()) {
      throw new Error('Approval preview did not save the latest Compose edits. Please try again.')
    }
  }

  const handleSendEmail = async () => {
    if (selectedGroupIds.length > 0) {
      await sendToEmailGroups(selectedGroupIds)
      return
    }
    const destinations = uniqueEmails([...selectedRecipientEmails, ...splitEmails(emailDestination)])
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
    if (!destinations.length) {
      onShowToast('Enter or select at least one recipient email')
      return
    }

    setSendingEmail(true)
    setEmailSendFeedback(null)
    try {
      const savedHtmlForApproval = await ensureCurrentEmailSavedForApproval()
      if (!savedHtmlForApproval) return
      const approvalHtmlBody = markEmailHtmlAsCustom(savedHtmlForApproval)
      const approvalMessageText = editorText
      const createdApproval = await approvalsApi.create({
        notification_id: notificationId,
        item_type: 'advisory',
        approver_user_id: Number(selectedApproverUserId),
        title: defaultHeading || emailSubject || `Advisory #${notificationId}`,
        subject: emailSubject || defaultHeading || undefined,
        message_text: approvalMessageText,
        html_body: approvalHtmlBody || undefined,
        recipient_emails: destinations,
        recipient_group_ids: [],
      })
      await ensureApprovalReceivedCurrentHtml(createdApproval, approvalHtmlBody)
      setEmailSendFeedback(`Approval request sent to ${destinations.length} recipient(s)`)
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
      const savedHtmlForApproval = await ensureCurrentEmailSavedForApproval()
      if (!savedHtmlForApproval) return
      const approvalHtmlBody = markEmailHtmlAsCustom(savedHtmlForApproval)
      const approvalMessageText = editorText
      const createdApproval = await approvalsApi.create({
        notification_id: notificationId,
        item_type: 'advisory',
        approver_user_id: Number(selectedApproverUserId),
        title: defaultHeading || emailSubject || `Advisory #${notificationId}`,
        subject: emailSubject || defaultHeading || undefined,
        message_text: approvalMessageText,
        html_body: approvalHtmlBody || undefined,
        recipient_emails: [],
        recipient_group_ids: groupIds,
      })
      await ensureApprovalReceivedCurrentHtml(createdApproval, approvalHtmlBody)
      setEmailSendFeedback(`Approval request sent to ${selectedGroups.length} group(s) (${destinations.length} recipients)`)
      onShowToast('Sent for approval')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send group email'
      setEmailSendFeedback(message)
    } finally {
      setSendingEmail(false)
    }
  }

  const handleDownloadPdf = async () => {
    let printableHtml = ''
    try {
      printableHtml = await getCurrentRenderedPreviewHtml()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to prepare PDF preview'
      onShowToast(message)
      return
    }
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
              <p className="compose-panel-copy">Edit the advisory text and review the live email preview before downloading or sending.</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="compose-word-count">{wordCount} words</div>
              {savingOutputChanges ? <span className="compose-autosave-status"><Loader2 size={14} className="spin" /> Saving</span> : null}
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
            <button type="button" className={modeButtonClass('text')} onClick={() => { void switchOutputMode('text') }}>
              Text Editor
            </button>
            <button type="button" className={modeButtonClass('email')} onClick={() => { void switchOutputMode('email') }}>
              Email Preview
            </button>
            <button type="button" className="compose-pill" onClick={() => { void handleDownloadPdf() }}>
              Download PDF
            </button>
          </div>

          {outputMode === 'email' ? (
            <div className="compose-canvas-shell">
              <div className="compose-canvas compose-canvas-preview">
                {editorDirty ? (
                  <div className="compose-meta-note" style={{ padding: '10px 12px' }}>
                    Saving latest text before refreshing preview...
                  </div>
                ) : null}
                {isFetchingMapPreview && !editorDirty ? (
                  <div className="compose-meta-note" style={{ padding: '10px 12px' }}>
                  {isFetchingEmailPreviewShell ? 'Loading email preview...' : 'Preparing affected property list...'}
                  </div>
                ) : null}
                {browserMapPreviewError && !editorDirty ? (
                  <div className="compose-alert-error" style={{ margin: '0 0 10px 0' }}>
                    Live map snapshot failed: {browserMapPreviewError}
                  </div>
                ) : null}
                <iframe
                  title="Email preview"
                  srcDoc={liveEmailPreviewDocument || '<div style="padding:24px;font-family:Arial,sans-serif;">Generate and save to refresh the branded preview.</div>'}
                  className="compose-email-iframe"
                  sandbox=""
                  referrerPolicy="no-referrer"
                  onLoad={(event) => normalizeEmailPreviewFrame(event.currentTarget)}
                />
              </div>
            </div>
          ) : (
            <div className="compose-canvas-shell">
              <div className="compose-meta-note" style={{ marginBottom: 10 }}>
                Edit the advisory in a clean document editor. The email template below remains read-only and updates from this text.
              </div>
              <AdvisoryRichTextEditor
                value={editorText}
                onChange={updateEditorText}
                saving={savingOutputChanges}
                onFocus={() => {
                  textEditorFocusedRef.current = true
                }}
                onBlur={() => {
                  textEditorFocusedRef.current = false
                  if (textEditorHasUserChanges) {
                    void persistTextEditorChanges()
                  }
                }}
              />
            </div>
          )}

          <div className="compose-output-actions">
            <div className="compose-email-card">
              <div className="compose-email-card-title">SMTP Email</div>
              <div className="compose-email-send-grid">
                <div className="compose-email-recipient-picker">
                  <div className="compose-email-recipient-search">
                    <input
                      className="compose-email-input compose-email-recipient-input"
                      value={emailDestination}
                      onChange={(e) => {
                        setEmailDestination(e.target.value)
                        setSelectedGroupIds([])
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ',' || event.key === ';' || event.key === 'Tab') {
                          if (emailDestination.trim()) {
                            event.preventDefault()
                            addRecipientEmails(splitEmails(emailDestination))
                          }
                        } else if (event.key === 'Escape') {
                          setEmailDestination('')
                        }
                      }}
                      placeholder={selectedRecipientEmails.length ? 'Search/add GM or SM email' : 'Recipient email address'}
                      list="compose-property-email-suggestions"
                      aria-label="Search or add GM/SM recipient email"
                    />
                    <datalist id="compose-property-email-suggestions">
                      {allPropertyEmailSuggestions.map((item) => (
                        <option key={`${normalizeEmail(item.email)}-${item.label}`} value={item.email}>
                          {item.label}
                        </option>
                      ))}
                    </datalist>
                  </div>
                  {emailDestination.trim() && filteredRecipientSuggestions.length > 0 ? (
                    <div className="compose-email-recipient-suggestions">
                      {filteredRecipientSuggestions.map((item) => (
                        <button
                          key={`${normalizeEmail(item.email)}-${item.label}`}
                          type="button"
                          onClick={() => addRecipientEmails([item.email])}
                          disabled={sendingEmail}
                        >
                          <span>{item.email}</span>
                          <small>{item.label}</small>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {impactedRecipientEmails.length > 0 ? (
                    <div className="compose-email-recipient-hint">
                      Auto-filled from affected property GM/SM contacts.
                    </div>
                  ) : null}
                  {selectedRecipientEmails.length > 0 ? (
                    <div className="compose-email-recipient-chips" aria-label="Selected recipient emails">
                      {selectedRecipientEmails.map((email) => (
                        <span key={normalizeEmail(email)} className="compose-email-recipient-chip">
                          {email}
                          <button
                            type="button"
                            onClick={() => removeRecipientEmail(email)}
                            aria-label={`Remove ${email}`}
                            disabled={sendingEmail}
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="compose-email-action-row">
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
                              setSelectedRecipientEmails([])
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

