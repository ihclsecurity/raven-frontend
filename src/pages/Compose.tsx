/**
 * Module: Compose
 * Purpose: Core module responsible for Compose concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { notificationsApi } from '../api/notifications'
import { useNotification } from '../hooks/useNotification'
import { useParsedSettings, useSettings } from '../hooks/useSettings'
import { useTemplates } from '../hooks/useTemplates'
import { ComposeAnalysisPanel, ComposeLeftPanel } from '../components/compose/ComposeLeftPanel'
import { ComposeAffectedProperties } from '../components/compose/ComposeAffectedProperties'
import { ComposeRightPanel } from '../components/compose/ComposeRightPanel'
import { parseGeographyJson } from '../constants/geography'
import type { LlmRuntimeInfo } from '../types/notification'
import type { ComposeTopBarControls } from '../components/layout/AppShell'
import { buildAzureOpenAiPayload } from '../utils/azureOpenAi'

export type GenerationPhase = 'idle' | 'preparing' | 'applying-template' | 'generating' | 'finalizing' | 'success' | 'error'

type ToastTone = 'success' | 'warning'
type ComposeGuideStep = {
  key: string
  targetId: string
  title: string
  description: string
  points?: string[]
}

const COMPOSE_GUIDE_STEPS: ComposeGuideStep[] = [
  {
    key: 'top-nav',
    targetId: 'dashboard-guide-topbar',
    title: 'Compose Advisory',
    description: 'This page helps you convert raw alerts into a clear advisory that can be reviewed and shared quickly.',
    points: [
      'Use Save in the top bar anytime to keep draft progress.',
    ],
  },
  {
    key: 'source-input',
    targetId: 'compose-guide-source',
    title: 'Source Input',
    description: 'Paste the raw alert or intelligence text here.',
    points: [
      'Enter a short heading, then click Done with Source Input to extract structured fields.',
    ],
  },
  {
    key: 'analysis',
    targetId: 'compose-guide-analysis',
    title: 'Classification and Geography',
    description: 'Review severity, confidence, impact, incident type, and location fields.',
    points: [
      'Correct these values before generating so the advisory is accurate.',
    ],
  },
  {
    key: 'impact',
    targetId: 'compose-guide-impact',
    title: 'Impacted Properties',
    description: 'Verify affected properties linked to this alert.',
    points: [
      'Add or remove properties to match operational reality before sharing.',
    ],
  },
  {
    key: 'template-generate',
    targetId: 'compose-guide-template',
    title: 'Template and Generate',
    description: 'Select the template, then generate the advisory draft.',
    points: [
      'Use this after source and analysis are complete.',
    ],
  },
  {
    key: 'final-advisory',
    targetId: 'compose-guide-advisory',
    title: 'Final Advisory',
    description: 'Review and edit final output, switch view modes, and send email.',
    points: [
      'Confirm subject, content, and destination before sending.',
    ],
  },
]

// Fields allowed during initial draft creation.
const CREATE_KEYS = [
  'heading',
  'email_subject',
  'template_id',
  'severity',
  'confidence',
  'business_impact',
  'incident_type',
  'geography_json',
  'tags_json',
  'source_text',
  'generated_text',
] as const

// Fields allowed in subsequent updates for existing drafts.
const UPDATE_KEYS = [
  ...CREATE_KEYS,
  'edited_text',
  'final_text',
  'channel_email_text',
  'status',
] as const

// Defensive helper to avoid sending unexpected payload keys to backend APIs.
function pickAllowedFields(
  source: Record<string, unknown>,
  allowed: ReadonlyArray<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      out[key] = source[key]
    }
  }
  return out
}

const toText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

export default function ComposePage() {
  const { setComposeTopBarControls, composeGuideLaunchNonce } = useOutletContext<{
    setComposeTopBarControls: (controls: ComposeTopBarControls | null) => void
    composeGuideLaunchNonce: number
  }>()
  const [params, setParams] = useSearchParams()
  const existingId = params.get('id') ? Number(params.get('id')) : null
  const shouldAutoGenerate = params.get('autogen') === '1'
  const queryClient = useQueryClient()
  const settings = useParsedSettings()
  const { data: rawSettings } = useSettings()
  const { data: existing } = useNotification(existingId)

  const [notificationId, setNotificationId] = useState<number | null>(existingId)
  const [fields, setFields] = useState<Record<string, unknown>>({})
  const [validationError, setValidationError] = useState<string | null>(null)
  const [autoExtractedFields, setAutoExtractedFields] = useState<Set<string>>(new Set())
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastTone, setToastTone] = useState<ToastTone>('success')
  const [generating, setGenerating] = useState(false)
  const [generationPhase, setGenerationPhase] = useState<GenerationPhase>('idle')
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [lastGeneratedTemplateName, setLastGeneratedTemplateName] = useState<string | null>(null)
  const [headerSaveStatus, setHeaderSaveStatus] = useState<'save' | 'saving' | 'saved'>('save')

  const manuallyEditedRef = useRef<Set<string>>(new Set())
  const autoGenerateTriggeredRef = useRef(false)
  const advisorySectionRef = useRef<HTMLElement>(null)
  const guideDoneTimeoutRef = useRef<number | null>(null)
  const pendingAdvisoryScrollRef = useRef(false)
  const handleHeaderSaveRef = useRef<(overrides?: Record<string, unknown>) => Promise<void>>(async () => undefined)
  const hydratedNotificationIdRef = useRef<number | null>(null)
  const [isGuideActive, setIsGuideActive] = useState(false)
  const [guideStepIndex, setGuideStepIndex] = useState(0)
  const [guidePopoverPosition, setGuidePopoverPosition] = useState({ top: 84, left: 20 })
  const [showGuideDoneMessage, setShowGuideDoneMessage] = useState(false)

  const { data: templates = [] } = useTemplates(true)

  const azureOpenAiPayload = buildAzureOpenAiPayload(rawSettings)

  // Hydrate local editor state when opening an existing draft via query param.
  useEffect(() => {
    if (!existing) return
    if (hydratedNotificationIdRef.current === existing.id) return
    if (notificationId === existing.id && Object.keys(fields).length > 0) {
      hydratedNotificationIdRef.current = existing.id
      return
    }
    hydratedNotificationIdRef.current = existing.id
    setFields(existing as unknown as Record<string, unknown>)
    setNotificationId(existing.id)
    const existingMap = existing as unknown as Record<string, unknown>
    const tracked = ['heading', 'severity', 'confidence', 'business_impact']
    manuallyEditedRef.current = new Set(tracked.filter((k) => toText(existingMap[k])))
  }, [existing, fields, notificationId])

  const sourceText = toText(fields.source_text)
  const generatedOutputText = toText(fields.final_text) || toText(fields.edited_text) || toText(fields.generated_text)
  const hasGeneratedOutput = Boolean(generatedOutputText)
  const analysisComplete = useMemo(() => {
    const classificationComplete = ['severity', 'confidence', 'business_impact', 'incident_type'].every((key) => toText(fields[key]))
    if (!classificationComplete) return false

    const rawGeography = fields.geography_json
    const geographyRecord =
      rawGeography && typeof rawGeography === 'object'
        ? (rawGeography as { countries?: unknown; states?: unknown; regions?: unknown })
        : null
    const geographyFromObject =
      geographyRecord
        ? {
            countries: Array.isArray(geographyRecord.countries)
              ? geographyRecord.countries.map((item: unknown) => String(item || '').trim()).filter(Boolean)
              : [],
            states: Array.isArray(geographyRecord.states)
              ? geographyRecord.states.map((item: unknown) => String(item || '').trim()).filter(Boolean)
              : [],
            regions: Array.isArray(geographyRecord.regions)
              ? geographyRecord.regions.map((item: unknown) => String(item || '').trim()).filter(Boolean)
              : [],
          }
        : null
    const hasExplicitGeography =
      (typeof rawGeography === 'string' && rawGeography.trim().length > 0 && rawGeography.trim() !== '{}') ||
      Boolean(
        geographyFromObject &&
          (geographyFromObject.countries.length > 0 ||
            geographyFromObject.states.length > 0 ||
            geographyFromObject.regions.length > 0),
      )
    if (!hasExplicitGeography) return false

    const geography = geographyFromObject ?? parseGeographyJson(rawGeography)
    return geography.countries.length > 0 && (geography.states.length > 0 || geography.regions.length > 0)
  }, [fields])
  const composeGuideSteps = useMemo(() => {
    if (analysisComplete) return COMPOSE_GUIDE_STEPS
    return COMPOSE_GUIDE_STEPS.filter((step) => step.key !== 'impact' && step.key !== 'template-generate')
  }, [analysisComplete])
  const activeGuideStep = isGuideActive ? composeGuideSteps[guideStepIndex] : null

  useEffect(() => {
    if (!pendingAdvisoryScrollRef.current || !hasGeneratedOutput) return
    pendingAdvisoryScrollRef.current = false
    window.setTimeout(() => {
      advisorySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 120)
  }, [generatedOutputText, hasGeneratedOutput])

  // Persist runtime provider/model metadata returned from extraction/generation.
  const applyLlmRuntime = (runtime: LlmRuntimeInfo | null | undefined) => {
    if (!runtime) {
      return false
    }
    setFields((prev) => ({
      ...prev,
      llm_requested_provider: runtime.requested_provider,
      llm_provider: runtime.provider,
      llm_model: runtime.model,
      llm_fallback_used: runtime.fallback_used,
      llm_fallback_reason: runtime.fallback_reason,
    }))
    return runtime.fallback_used
  }

  // Source extraction flow: create draft (if needed), call extractor, then merge non-manual fields.
  const handleDoneSourceInput = async () => {
    const text = sourceText
    if (!text) return
    setGenerateError(null)

    try {
      let id = notificationId
      if (!id) {
        const payload: Record<string, unknown> = pickAllowedFields(fields, CREATE_KEYS)
        const created = await createMutation.mutateAsync(payload)
        syncNotification(created as unknown as Record<string, unknown> & { id: number })
        id = created.id
      }

      const extracted = await notificationsApi.extractMetadata(
        id,
        azureOpenAiPayload,
      )
      const usedFallback = applyLlmRuntime(extracted.llm_runtime)

      setFields((prev) => {
        const updates: Record<string, unknown> = {}
        const newAuto = new Set<string>()

        if (extracted.severity && !manuallyEditedRef.current.has('severity')) {
          updates.severity = extracted.severity
          newAuto.add('severity')
        }
        if (extracted.confidence && !manuallyEditedRef.current.has('confidence')) {
          updates.confidence = extracted.confidence
          newAuto.add('confidence')
        }
        if (extracted.business_impact && !manuallyEditedRef.current.has('business_impact')) {
          updates.business_impact = extracted.business_impact
          newAuto.add('business_impact')
        }
        if (extracted.incident_type && !manuallyEditedRef.current.has('incident_type')) {
          updates.incident_type = extracted.incident_type
          newAuto.add('incident_type')
        }
        if (extracted.geography && !manuallyEditedRef.current.has('geography_json')) {
          updates.geography_json = JSON.stringify(extracted.geography)
          newAuto.add('geography_json')
        }

        if (Object.keys(updates).length) {
          setAutoExtractedFields((a) => new Set([...a, ...newAuto]))
          return { ...prev, ...updates }
        }
        return prev
      })

      if (usedFallback && extracted.llm_runtime) {
        showToast(
          `Extracted from Source using ${extracted.llm_runtime.provider}${extracted.llm_runtime.model ? ` (${extracted.llm_runtime.model})` : ''} after Azure OpenAI fallback.`,
          'warning',
        )
      } else {
        onDoneToast()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to extract metadata from source'
      setGenerateError(message)
    }
  }

  // Reset source + generated outputs while preserving notification shell and template context.
  const handleClearSourceInput = () => {
    const keysToReset = [
      'source_text',
      'heading',
      'severity',
      'confidence',
      'business_impact',
      'incident_type',
      'email_subject',
      'generated_text',
      'edited_text',
      'final_text',
    ]
    setFields((prev) => {
      const next = { ...prev }
      for (const key of keysToReset) {
        if (key in next) {
          next[key] = ''
        }
      }
      next.geography_json = '{}'
      return next
    })
    setAutoExtractedFields(new Set())
    setValidationError(null)
    setGenerateError(null)
    setLastGeneratedTemplateName(null)
    setHeaderSaveStatus('save')
    manuallyEditedRef.current.clear()
    showToast('All content fields cleared')
  }

  // Create/save mutations are intentionally separate: create builds record, save enforces heading rule.
  const createMutation = useMutation({
    mutationFn: notificationsApi.create,
    onSuccess: (created) => {
      setNotificationId(created.id)
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
  const saveMutation = useMutation({
    mutationFn: ({ id, heading }: { id: number; heading: string }) => notificationsApi.save(id, heading),
    onSuccess: (saved) => {
      setFields(saved as unknown as Record<string, unknown>)
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notification', saved.id] })
    },
  })

  const handleChange = (key: string, value: unknown) => {
    setHeaderSaveStatus('save')
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  const handleTemplateChange = (id: number | null) => {
    setHeaderSaveStatus('save')
    setFields((prev) => ({ ...prev, template_id: id }))
  }

  const handleTagsChange = (nextTagsJson: string) => {
    setHeaderSaveStatus('save')
    setFields((prev) => ({ ...prev, tags_json: nextTagsJson }))
    if (!notificationId) {
      return
    }
    void notificationsApi.update(notificationId, { tags_json: nextTagsJson }).then(() => {
      queryClient.setQueryData(['notification', notificationId], (current: unknown) => {
        if (current && typeof current === 'object') {
          return { ...(current as Record<string, unknown>), tags_json: nextTagsJson }
        }
        return current
      })
      void queryClient.invalidateQueries({ queryKey: ['notification-impact-map-payload', notificationId] })
      void queryClient.invalidateQueries({ queryKey: ['notification-email-preview', notificationId] })
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    }).catch((error) => {
      const message = error instanceof Error ? error.message : 'Failed to update impacted properties.'
      showToast(message, 'warning')
    })
  }

  // Auto-apply first template only for brand-new drafts with no explicit template choice.
  useEffect(() => {
    if (templates.length > 0 && !notificationId && !fields.template_id) {
      const defaultTemplate = templates[0]
      if (defaultTemplate) {
        setFields((prev) => (prev.template_id ? prev : { ...prev, template_id: defaultTemplate.id }))
      }
    }
  }, [templates, notificationId, fields.template_id])

  const handleFieldChange = (key: string, value: unknown) => {
    setHeaderSaveStatus('save')
    manuallyEditedRef.current.add(key)
    setAutoExtractedFields((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    setFields((prev) => ({ ...prev, [key]: value }))
    if (key === 'heading' && validationError) setValidationError(null)
  }

  // Keep query cache in sync after all backend-mutating actions.
  const syncNotification = (notification: Record<string, unknown> & { id: number }) => {
    setNotificationId(notification.id)
    setFields(notification)
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    queryClient.invalidateQueries({ queryKey: ['notification', notification.id] })
  }

  // Shared guard to ensure every action operates on a persisted notification row.
  const ensureNotificationRecord = async (overrides: Record<string, unknown> = {}) => {
    let id = notificationId
    const draftFields = Object.keys(overrides).length ? { ...fields, ...overrides } : fields
    if (!id) {
      const payload: Record<string, unknown> = pickAllowedFields(draftFields, CREATE_KEYS)
      const created = await createMutation.mutateAsync(payload)
      syncNotification(created as unknown as Record<string, unknown> & { id: number })
      return created.id
    }
    const updatePayload = pickAllowedFields(draftFields, UPDATE_KEYS)
    const updated = await notificationsApi.update(id, updatePayload)
    syncNotification(updated as unknown as Record<string, unknown> & { id: number })
    return id
  }

  // Save validates required heading and persists current editor state.
  const handleSave = async (overrides: Record<string, unknown> = {}) => {
    const draftFields = Object.keys(overrides).length ? { ...fields, ...overrides } : fields
    const heading = toText(draftFields.heading)
    if (!heading) {
      setValidationError('Heading is required before saving.')
      return false
    }
    setValidationError(null)

    const id = await ensureNotificationRecord(overrides)
    await saveMutation.mutateAsync({ id, heading })
    return true
  }

  const handleHeaderSave = async (overrides: Record<string, unknown> = {}) => {
    if (headerSaveStatus === 'saving') return
    setHeaderSaveStatus('saving')
    try {
      const didSave = await handleSave(overrides)
      setHeaderSaveStatus(didSave ? 'saved' : 'save')
    } catch {
      setHeaderSaveStatus('save')
    }
  }

  const handlePreviewRefresh = async (overrides: Record<string, unknown> = {}) => {
    const draftFields = Object.keys(overrides).length ? { ...fields, ...overrides } : fields
    const heading = toText(draftFields.heading)
    if (!heading) {
      setValidationError('Heading is required before refreshing the email preview.')
      return
    }
    setValidationError(null)
    await ensureNotificationRecord(overrides)
    setHeaderSaveStatus('save')
  }

  // Generation flow with visible phase tracking for user feedback and fallback transparency.
  const handleGenerate = async () => {
    setGenerateError(null)
    setGenerating(true)
    setGenerationPhase('preparing')
    try {
      const id = await ensureNotificationRecord()
      setGenerationPhase('applying-template')
      setGenerationPhase('generating')
      const generated = await notificationsApi.generate(
        id,
        azureOpenAiPayload,
      )
      syncNotification(generated as unknown as Record<string, unknown> & { id: number })
      const usedFallback = applyLlmRuntime({
        requested_provider: String((generated as unknown as Record<string, unknown>).llm_requested_provider || ''),
        provider: String((generated as unknown as Record<string, unknown>).llm_provider || ''),
        model: String((generated as unknown as Record<string, unknown>).llm_model || ''),
        fallback_used: Boolean((generated as unknown as Record<string, unknown>).llm_fallback_used),
        fallback_reason: ((generated as unknown as Record<string, unknown>).llm_fallback_reason as string) || null,
      })
      if (usedFallback) {
        showToast(
          `Generated with ${String((generated as unknown as Record<string, unknown>).llm_provider || 'azure_openai')}${String((generated as unknown as Record<string, unknown>).llm_model || '') ? ` (${String((generated as unknown as Record<string, unknown>).llm_model)})` : ''} after provider fallback.`,
          'warning',
        )
      }
      setFields((prev) => ({
        ...prev,
        generated_text: (generated as unknown as Record<string, unknown>).generated_text,
      }))
      setGenerationPhase('finalizing')
      const appliedTemplateId = (generated as unknown as Record<string, unknown>).template_id as number | undefined
      const appliedTemplate = templates.find((template) => template.id === appliedTemplateId)
      setLastGeneratedTemplateName(appliedTemplate?.name ?? null)
      const nextText = toText((generated as unknown as Record<string, unknown>).generated_text)
      if (!nextText) {
        setGenerationPhase('error')
        setGenerateError('Generation completed but returned empty output. Check source input, template, and LLM settings.')
      } else {
        pendingAdvisoryScrollRef.current = true
        setGenerationPhase('success')
      }
    } catch (error) {
      setGenerationPhase('error')
      const message = error instanceof Error ? error.message : 'Failed to generate output.'
      setGenerateError(message)
    } finally {
      setGenerating(false)
      setTimeout(() => {
        setGenerationPhase((current) => (current === 'success' ? 'idle' : current))
      }, 1200)
    }
  }

  // One-time auto-generate entrypoint used by navigation with ?autogen=1.
  useEffect(() => {
    if (!shouldAutoGenerate || autoGenerateTriggeredRef.current) return
    if (!notificationId) return

    autoGenerateTriggeredRef.current = true
    showToast('Generating summary...')
    void handleGenerate()

    const next = new URLSearchParams(params)
    next.delete('autogen')
    setParams(next, { replace: true })
  }, [shouldAutoGenerate, notificationId, params, setParams])

  // Lightweight success/warning toast utility shared across compose actions.
  const showToast = (message: string, tone: ToastTone = 'success') => {
    setToastTone(tone)
    setToastMessage(message)
    setTimeout(() => setToastMessage(null), 2000)
  }

  const onDoneToast = () => showToast('Extracted from Source')
  const headerSaveLabel =
    headerSaveStatus === 'saving' ? 'Saving draft' : headerSaveStatus === 'saved' ? 'Draft saved' : 'Save draft'

  useEffect(() => {
    handleHeaderSaveRef.current = handleHeaderSave
  }, [handleHeaderSave])

  useEffect(() => {
    setComposeTopBarControls({
      saveStatus: headerSaveStatus,
      saveLabel: headerSaveLabel,
      onSave: () => {
        void handleHeaderSaveRef.current()
      },
    })
    return () => setComposeTopBarControls(null)
  }, [headerSaveLabel, headerSaveStatus, setComposeTopBarControls])

  const finishGuide = useCallback(() => {
    setIsGuideActive(false)
    setGuideStepIndex(0)
    setShowGuideDoneMessage(true)
    if (guideDoneTimeoutRef.current) {
      window.clearTimeout(guideDoneTimeoutRef.current)
    }
    guideDoneTimeoutRef.current = window.setTimeout(() => {
      setShowGuideDoneMessage(false)
    }, 2400)
  }, [])

  useEffect(() => {
    return () => {
      if (guideDoneTimeoutRef.current) {
        window.clearTimeout(guideDoneTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!composeGuideLaunchNonce) return
    setShowGuideDoneMessage(false)
    setGuideStepIndex(0)
    setIsGuideActive(true)
  }, [composeGuideLaunchNonce])

  useEffect(() => {
    setGuideStepIndex((current) => Math.min(current, Math.max(0, composeGuideSteps.length - 1)))
  }, [composeGuideSteps.length])

  useEffect(() => {
    if (!activeGuideStep) return

    const targetElement = document.getElementById(activeGuideStep.targetId)
    if (!targetElement) return

    targetElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    })

    const updatePopoverPosition = () => {
      const rect = targetElement.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const cardWidth = Math.min(360, Math.max(260, viewportWidth - 32))
      const cardHeight = 280
      const horizontalGap = 16
      const shouldPlaceRight = rect.right + cardWidth + horizontalGap < viewportWidth
      let left = shouldPlaceRight
        ? rect.right + horizontalGap
        : rect.left - cardWidth - horizontalGap

      const sideFits = left >= 16 && left + cardWidth <= viewportWidth - 16
      let top = rect.top + rect.height / 2 - 104

      if (!sideFits) {
        left = Math.max(16, Math.min(viewportWidth - cardWidth - 16, rect.left + rect.width / 2 - cardWidth / 2))
        const gap = 14
        const belowTop = rect.bottom + gap
        const aboveTop = rect.top - cardHeight - gap
        if (belowTop + cardHeight <= viewportHeight - 16) {
          top = belowTop
        } else if (aboveTop >= 16) {
          top = aboveTop
        } else {
          top = Math.max(16, Math.min(viewportHeight - cardHeight - 16, belowTop))
        }
      }

      top = Math.max(16, Math.min(viewportHeight - cardHeight - 16, top))
      setGuidePopoverPosition({ top, left })
    }

    const timeoutId = window.setTimeout(updatePopoverPosition, 340)
    const frameId = window.requestAnimationFrame(updatePopoverPosition)
    window.addEventListener('resize', updatePopoverPosition)
    window.addEventListener('scroll', updatePopoverPosition, true)

    return () => {
      window.clearTimeout(timeoutId)
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', updatePopoverPosition)
      window.removeEventListener('scroll', updatePopoverPosition, true)
    }
  }, [activeGuideStep])

  useEffect(() => {
    const topbar = document.getElementById('dashboard-guide-topbar')
    if (!topbar) return
    const shouldHighlight = isGuideActive && activeGuideStep?.key === 'top-nav'
    topbar.classList.toggle('dashboard-guide-topbar-active', shouldHighlight)
    return () => {
      topbar.classList.remove('dashboard-guide-topbar-active')
    }
  }, [activeGuideStep?.key, isGuideActive])

  useEffect(() => {
    if (!isGuideActive) return

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        setGuideStepIndex((current) => Math.max(0, current - 1))
      }
      if (event.key === 'ArrowRight') {
        setGuideStepIndex((current) => {
          if (current >= composeGuideSteps.length - 1) {
            finishGuide()
            return current
          }
          return current + 1
        })
      }
      if (event.key === 'Escape') {
        setIsGuideActive(false)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [composeGuideSteps.length, finishGuide, isGuideActive])

  const handleGuideNext = useCallback(() => {
    setGuideStepIndex((current) => {
      if (current >= composeGuideSteps.length - 1) {
        finishGuide()
        return current
      }
      return current + 1
    })
  }, [composeGuideSteps.length, finishGuide])

  const handleGuidePrevious = useCallback(() => {
    setGuideStepIndex((current) => Math.max(0, current - 1))
  }, [])

  const guideClassFor = useCallback((stepKey: string) => {
    if (!isGuideActive || !activeGuideStep) return ''
    return ` compose-guide-target${activeGuideStep.key === stepKey ? ' is-active' : ' is-dimmed'}`
  }, [activeGuideStep, isGuideActive])

  return (
    <div className={`compose-page${isGuideActive ? ' is-guide-active' : ''}`}>
      <div className="compose-workbench">
        <div id="compose-guide-source" className={guideClassFor('source-input')}>
          <ComposeLeftPanel
            fields={fields}
            onChange={handleChange}
          onFieldChange={handleFieldChange}
          autoExtractedFields={autoExtractedFields}
          onDoneSourceInput={handleDoneSourceInput}
          onClearSourceInput={handleClearSourceInput}
          validationError={validationError}
        />
      </div>
        <div id="compose-guide-analysis" className={guideClassFor('analysis')}>
          <ComposeAnalysisPanel
            fields={fields}
            onFieldChange={handleFieldChange}
            autoExtractedFields={autoExtractedFields}
            settings={settings}
          />
        </div>

        <section className="compose-impact-generate-row compose-workbench-template-row">
          <div id="compose-guide-impact" className={guideClassFor('impact')}>
            <ComposeAffectedProperties
              fields={fields}
              notificationId={notificationId}
              onTagsChange={handleTagsChange}
            />
          </div>
          <div id="compose-guide-template" className={guideClassFor('template-generate')}>
            <ComposeRightPanel
              advisoryRef={advisorySectionRef}
              notificationId={notificationId}
              fields={fields}
              onChange={handleChange}
              templates={templates}
              onTemplateChange={handleTemplateChange}
              onGenerate={handleGenerate}
              generating={generating}
              generationPhase={generationPhase}
              generateError={generateError}
              lastGeneratedTemplateName={lastGeneratedTemplateName}
              onShowToast={showToast}
              saveStatus={headerSaveStatus}
              saveLabel={headerSaveLabel}
              onSave={(overrides) => handleHeaderSaveRef.current(overrides)}
              onRefreshPreview={handlePreviewRefresh}
              showAdvisoryPanel={false}
              className="compose-generation-stack--compact"
            />
          </div>
        </section>
      </div>

      <div id="compose-guide-advisory" className={guideClassFor('final-advisory')}>
        <ComposeRightPanel
          advisoryRef={advisorySectionRef}
          notificationId={notificationId}
          fields={fields}
          onChange={handleChange}
          templates={templates}
          onTemplateChange={handleTemplateChange}
          onGenerate={handleGenerate}
          generating={generating}
          generationPhase={generationPhase}
          generateError={generateError}
          lastGeneratedTemplateName={lastGeneratedTemplateName}
          onShowToast={showToast}
          saveStatus={headerSaveStatus}
          saveLabel={headerSaveLabel}
          onSave={(overrides) => handleHeaderSaveRef.current(overrides)}
          onRefreshPreview={handlePreviewRefresh}
          showTemplatePanel={false}
        />
      </div>

      {isGuideActive && activeGuideStep ? (
        <div
          className="compose-guide-popover"
          style={{ top: `${guidePopoverPosition.top}px`, left: `${guidePopoverPosition.left}px` }}
          role="dialog"
          aria-live="polite"
          aria-label="Compose guide"
        >
          <div className="compose-guide-progress">
            Step {guideStepIndex + 1} of {composeGuideSteps.length}
          </div>
          <button
            type="button"
            className="compose-guide-close-btn btn-danger-action"
            onClick={() => setIsGuideActive(false)}
            aria-label="Close guide"
            title="Close guide"
          >
            <X size={14} />
          </button>
          <h4>{activeGuideStep.title}</h4>
          <p>{activeGuideStep.description}</p>
          {activeGuideStep.points?.length ? (
            <ul className="compose-guide-points">
              {activeGuideStep.points.map((point, idx) => (
                <li key={`${activeGuideStep.key}-point-${idx}`}>{point}</li>
              ))}
            </ul>
          ) : null}
          <div className="compose-guide-controls">
            <button
              type="button"
              className="compose-guide-arrow compose-guide-arrow--prev"
              onClick={handleGuidePrevious}
              disabled={guideStepIndex === 0}
              aria-label="Previous step"
              title="Previous"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              className="compose-guide-arrow compose-guide-arrow--next"
              onClick={handleGuideNext}
              aria-label={guideStepIndex === composeGuideSteps.length - 1 ? 'Finish guide' : 'Next step'}
              title={guideStepIndex === composeGuideSteps.length - 1 ? 'Finish' : 'Next'}
            >
              {guideStepIndex === composeGuideSteps.length - 1 ? 'Finish' : <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      ) : null}

      {showGuideDoneMessage ? (
        <div className="compose-guide-done" role="status" aria-live="polite">
          Compose guide completed.
        </div>
      ) : null}

      {toastMessage && (
        <div className={`compose-toast${toastTone === 'warning' ? ' is-warning' : ' is-success'}`}>
          {toastMessage}
        </div>
      )}
    </div>
  )
}

