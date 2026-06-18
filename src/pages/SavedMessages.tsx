/**
 * Module: Savedmessages
 * Purpose: Core module responsible for Savedmessages concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { notificationsApi } from '../api/notifications'
import { useTemplates } from '../hooks/useTemplates'
import { FilterBar } from '../components/saved/FilterBar'
import { SmartTabs } from '../components/saved/SmartTabs'
import { SavedMessageRow } from '../components/saved/SavedMessageRow'
import { formatAppDate, formatAppDateTime } from '../utils/dateTime'

type SavedGuideStep = {
  key: string
  title: string
  description: string
  points: string[]
  targetId: string
}

const SAVED_GUIDE_STEPS: SavedGuideStep[] = [
  {
    key: 'top-nav',
    title: 'Saved Messages Workspace',
    description: 'Use this page to triage drafted, approved, and sent messages before reopening them in Compose.',
    points: [
      'This is your operational queue for message lifecycle management.',
      'Bulk actions help process multiple messages quickly.',
    ],
    targetId: 'dashboard-guide-topbar',
  },
  {
    key: 'tabs',
    title: 'Status Tabs',
    description: 'Switch tabs to focus on all messages, pending approvals, ready-to-send, or sent items.',
    points: [
      'Tabs apply built-in status filters automatically.',
      'Use this as the first step before detailed filtering.',
    ],
    targetId: 'saved-guide-tabs',
  },
  {
    key: 'filters',
    title: 'Filter Bar',
    description: 'Narrow the list by date, template, severity, and other attributes to find specific messages.',
    points: [
      'Filters work together with active tab constraints.',
      'Use Clear to reset and return to default listing.',
    ],
    targetId: 'saved-guide-filters',
  },
  {
    key: 'bulk-actions',
    title: 'Bulk Actions',
    description: 'Select multiple messages and run archive, summary creation, or selection reset in one pass.',
    points: [
      'Create Summary compiles selected messages into a compose-ready draft.',
      'Selection count confirms how many records will be affected.',
    ],
    targetId: 'saved-guide-actions',
  },
  {
    key: 'table',
    title: 'Message Table',
    description: 'Review details per row, then open a message in Compose or run row-specific actions.',
    points: [
      'Use checkboxes for bulk workflows.',
      'Use row actions for targeted open, archive, or delete operations.',
    ],
    targetId: 'saved-guide-table',
  },
]

export default function SavedMessagesPage() {
  const { savedMessagesGuideLaunchNonce } = useOutletContext<{
    savedMessagesGuideLaunchNonce: number
  }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: templates = [] } = useTemplates(false)

  const [tab, setTab] = useState('all')
  const [filters, setFilters] = useState<Record<string, unknown>>({ page: 1, page_size: 10 })
  const [selected, setSelected] = useState<number[]>([])
  const guideDoneTimeoutRef = useRef<number | null>(null)
  const [isGuideActive, setIsGuideActive] = useState(false)
  const [guideStepIndex, setGuideStepIndex] = useState(0)
  const [guidePopoverPosition, setGuidePopoverPosition] = useState({ top: 84, left: 20 })
  const [showGuideDoneMessage, setShowGuideDoneMessage] = useState(false)
  const activeGuideStep = isGuideActive ? SAVED_GUIDE_STEPS[guideStepIndex] : null

  const tabFilters = useMemo(() => {
    if (tab === 'awaiting_approval') return { approval_status: 'pending' }
    if (tab === 'ready') return { status: 'ready' }
    if (tab === 'sent') return { status: 'sent' }
    return {}
  }, [tab])

  const merged = { ...filters, ...tabFilters }
  const { data } = useQuery({
    queryKey: ['notifications', merged],
    queryFn: () => notificationsApi.list(merged),
  })
  const currentPage = Number(filters.page || 1)
  const pageSize = Number(filters.page_size || 10)
  const totalPages = Math.max(1, Math.ceil(Number(data?.total || 0) / pageSize))

  const templateNameById = useMemo(() => {
    const entries = templates.map((template) => [template.id, template.name] as const)
    return new Map<number, string>(entries)
  }, [templates])

  const toggle = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const onArchive = async (id: number) => {
    await notificationsApi.archive(id)
    await queryClient.invalidateQueries({ queryKey: ['notifications'] })
    setSelected((prev) => prev.filter((x) => x !== id))
  }

  const onDelete = async (id: number) => {
    if (!window.confirm('Delete this message permanently? This cannot be undone.')) return
    await notificationsApi.remove(id)
    await queryClient.invalidateQueries({ queryKey: ['notifications'] })
    setSelected((prev) => prev.filter((x) => x !== id))
  }

  const archiveSelected = async () => {
    if (!selected.length) return
    for (const id of selected) {
      await notificationsApi.archive(id)
    }
    setSelected([])
    await queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  const selectAllOnPage = () => {
    const ids = (data?.items || []).map((item) => item.id)
    setSelected(ids)
  }

  const createSummaryFromSelected = async () => {
    const selectedItems = (data?.items || []).filter((item) => selected.includes(item.id))
    if (!selectedItems.length) return

    const summaryTemplate =
      templates.find((template) => template.name.trim().toLowerCase() === 'messages summary')
      || templates.find((template) => template.type === 'summary')
      || templates.find((template) => template.name.toLowerCase().includes('summary'))

    if (!summaryTemplate) {
      window.alert('Summary template not found. Please create or activate a template named "Messages Summary" (or a template of type "summary").')
      return
    }

    const sourceBlocks = selectedItems.map((item, index) => {
      const content = item.final_text || item.edited_text || item.generated_text || item.source_text || ''
      const templateName = item.template_id ? (templateNameById.get(item.template_id) || `Template #${item.template_id}`) : 'Not set'
      return [
        `Message ${index + 1}`,
        `Heading: ${item.heading || '(Untitled)'}`,
        `Template Used: ${templateName}`,
        `Severity: ${item.severity || 'Not set'}`,
        `Status: ${item.status || 'draft'}`,
        `Updated: ${formatAppDateTime(item.updated_at, 'Unknown')}`,
        'Content:',
        String(content).trim() || '(No content)',
      ].join('\n')
    })

    const sourceText = [
      `Selected messages for summary: ${selectedItems.length}`,
      '',
      ...sourceBlocks.join('\n\n---\n\n').split('\n'),
    ].join('\n')

    try {
      const created = await notificationsApi.create({
        heading: `Messages Summary - ${formatAppDate()}`,
        template_id: summaryTemplate.id,
        source_text: sourceText,
      })
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
      setSelected([])
      navigate(`/compose?id=${created.id}&autogen=1`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create summary.'
      window.alert(message)
    }
  }

  const finishGuide = useCallback(() => {
    setIsGuideActive(false)
    setGuideStepIndex(0)
    setShowGuideDoneMessage(true)
    if (guideDoneTimeoutRef.current) window.clearTimeout(guideDoneTimeoutRef.current)
    guideDoneTimeoutRef.current = window.setTimeout(() => setShowGuideDoneMessage(false), 2200)
  }, [])

  useEffect(() => {
    return () => {
      if (guideDoneTimeoutRef.current) window.clearTimeout(guideDoneTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!savedMessagesGuideLaunchNonce) return
    setShowGuideDoneMessage(false)
    setGuideStepIndex(0)
    setIsGuideActive(true)
  }, [savedMessagesGuideLaunchNonce])

  useEffect(() => {
    if (!activeGuideStep) return
    const targetElement = document.getElementById(activeGuideStep.targetId)
    if (!targetElement) return
    const positionPopover = () => {
      const targetRect = targetElement.getBoundingClientRect()
      const popoverWidth = 350
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const margin = 16
      const topbar = document.querySelector('.app-topbar')
      const topbarBottom = topbar ? topbar.getBoundingClientRect().bottom : 0
      const scrollY = window.scrollY
      const scrollX = window.scrollX
      let left = targetRect.left + scrollX
      if (left + popoverWidth > scrollX + viewportWidth - margin) left = scrollX + viewportWidth - popoverWidth - margin
      if (left < scrollX + margin) left = scrollX + margin
      let top = targetRect.bottom + scrollY + 12
      if (top + 280 > scrollY + viewportHeight - margin) top = targetRect.top + scrollY - 300
      const minTop = Math.max(topbarBottom + scrollY + 10, scrollY + margin)
      if (top < minTop) top = minTop
      setGuidePopoverPosition({ top, left })
    }
    positionPopover()
    window.addEventListener('resize', positionPopover)
    window.addEventListener('scroll', positionPopover, true)
    return () => {
      window.removeEventListener('resize', positionPopover)
      window.removeEventListener('scroll', positionPopover, true)
    }
  }, [activeGuideStep])

  useEffect(() => {
    const topbar = document.getElementById('dashboard-guide-topbar')
    if (!topbar) return
    const shouldHighlight = isGuideActive && activeGuideStep?.key === 'top-nav'
    topbar.classList.toggle('dashboard-guide-topbar-active', shouldHighlight)
    return () => topbar.classList.remove('dashboard-guide-topbar-active')
  }, [activeGuideStep?.key, isGuideActive])

  useEffect(() => {
    if (!isGuideActive) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setGuideStepIndex((current) => Math.max(0, current - 1))
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setGuideStepIndex((current) => {
          if (current >= SAVED_GUIDE_STEPS.length - 1) {
            finishGuide()
            return current
          }
          return current + 1
        })
      } else if (event.key === 'Escape') {
        event.preventDefault()
        setIsGuideActive(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [finishGuide, isGuideActive])

  const handleGuideNext = useCallback(() => {
    setGuideStepIndex((current) => {
      if (current >= SAVED_GUIDE_STEPS.length - 1) {
        finishGuide()
        return current
      }
      return current + 1
    })
  }, [finishGuide])

  const handleGuidePrevious = useCallback(() => {
    setGuideStepIndex((current) => Math.max(0, current - 1))
  }, [])

  const guideClassFor = useCallback((stepKey: string) => {
    if (!isGuideActive || !activeGuideStep) return ''
    return ` saved-guide-target${activeGuideStep.key === stepKey ? ' is-active' : ' is-dimmed'}`
  }, [activeGuideStep, isGuideActive])

  useEffect(() => {
    setFilters((prev) => ({ ...prev, page: 1, page_size: 10 }))
    setSelected([])
  }, [tab])

  return (
    <section className={`saved-page${isGuideActive ? ' is-guide-active' : ''}`}>
      <div id="saved-guide-tabs" className={guideClassFor('tabs')}>
        <SmartTabs active={tab} onChange={setTab} />
      </div>
      <div id="saved-guide-filters" className={guideClassFor('filters')}>
        <FilterBar
          filters={filters}
          onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value, page: 1, page_size: 10 }))}
          onClear={() => setFilters({ page: 1, page_size: 10 })}
        />
      </div>

      <div className="saved-summary-line">
        Showing {data?.items?.length || 0} of {data?.total || 0} messages
      </div>

      <div id="saved-guide-actions" className={`saved-actions-bar${guideClassFor('bulk-actions')}`}>
        <button
          className="btn-secondary"
          onClick={selectAllOnPage}
          disabled={!data?.items?.length}
        >
          Select all on page
        </button>
        <button
          className="btn-primary"
          onClick={() => { void archiveSelected() }}
          disabled={!selected.length}
        >
          Archive selected
        </button>
        <button
          className="btn-primary"
          onClick={() => { void createSummaryFromSelected() }}
          disabled={!selected.length}
        >
          Create Summary
        </button>
        <button
          className="btn-secondary"
          onClick={() => setSelected([])}
          disabled={!selected.length}
        >
          Clear selection
        </button>
        {selected.length > 0 && (
          <span className="saved-selected-count">{selected.length} selected</span>
        )}
      </div>

      <table id="saved-guide-table" className={`saved-table${guideClassFor('table')}`}>
        <thead>
          <tr>
            <th></th>
            <th align="left">Time</th>
            <th align="left">Heading</th>
            <th align="left">Template Used</th>
            <th align="left">Severity</th>
            <th align="left">Approval</th>
            <th align="left">Status</th>
            <th align="left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {(data?.items || []).map((item) => (
            <SavedMessageRow
              key={item.id}
              item={item}
              templateName={item.template_id ? (templateNameById.get(item.template_id) || `Template #${item.template_id}`) : 'Not set'}
              checked={selected.includes(item.id)}
              onToggle={toggle}
              onOpen={(id) => navigate(`/compose?id=${id}`)}
              onArchive={onArchive}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>

      <div className="saved-actions-bar">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, currentPage - 1), page_size: 10 }))}
          disabled={currentPage <= 1}
          aria-label="Previous page"
          title="Previous page"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="saved-selected-count">
          Page {currentPage} of {totalPages}
        </span>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setFilters((prev) => ({ ...prev, page: Math.min(totalPages, currentPage + 1), page_size: 10 }))}
          disabled={currentPage >= totalPages}
          aria-label="Next page"
          title="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {selected.length > 0 ? (
        <div className="saved-bulk-bar">
          <span>{selected.length} selected</span>
          <button
            className="btn-secondary"
            onClick={() => {
              const selectedItems = (data?.items || []).filter((item) => selected.includes(item.id))
              const blob = new Blob([JSON.stringify(selectedItems, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `selected_messages_${new Date().toISOString().slice(0, 10)}.json`
              a.click()
              URL.revokeObjectURL(url)
            }}
          >
            Export Selected
          </button>
          <button
            className="btn-secondary"
            onClick={() => setSelected([])}
          >
            Clear
          </button>
        </div>
      ) : null}
      {isGuideActive && activeGuideStep ? (
        <div
          className="saved-guide-popover"
          style={{ top: `${guidePopoverPosition.top}px`, left: `${guidePopoverPosition.left}px` }}
          role="dialog"
          aria-modal="false"
          aria-label="Saved messages guide"
        >
          <div className="saved-guide-progress">
            Step {guideStepIndex + 1} of {SAVED_GUIDE_STEPS.length}
          </div>
          <button
            type="button"
            className="saved-guide-close-btn btn-danger-action"
            onClick={() => setIsGuideActive(false)}
            aria-label="Close guide"
            title="Close guide"
          >
            <X size={16} />
          </button>
          <h4>{activeGuideStep.title}</h4>
          <p>{activeGuideStep.description}</p>
          <ul className="saved-guide-points">
            {activeGuideStep.points.map((point, idx) => (
              <li key={`${activeGuideStep.key}-point-${idx}`}>{point}</li>
            ))}
          </ul>
          <div className="saved-guide-controls">
            <button
              type="button"
              className="saved-guide-arrow saved-guide-arrow--prev"
              onClick={handleGuidePrevious}
              disabled={guideStepIndex === 0}
            >
              Previous
            </button>
            <button
              type="button"
              className="saved-guide-arrow saved-guide-arrow--next"
              onClick={handleGuideNext}
            >
              {guideStepIndex === SAVED_GUIDE_STEPS.length - 1 ? 'Finish' : <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      ) : null}
      {showGuideDoneMessage ? (
        <div className="saved-guide-done" role="status" aria-live="polite">
          Saved Messages guide completed.
        </div>
      ) : null}
    </section>
  )
}

