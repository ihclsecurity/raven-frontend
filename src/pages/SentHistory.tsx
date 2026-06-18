/**
 * Module: Senthistory
 * Purpose: Core module responsible for Senthistory concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, X } from 'lucide-react'
import { deliveryApi } from '../api/delivery'
import type { DeliveryHistoryFilters } from '../types/delivery'
import { formatAppDateTime } from '../utils/dateTime'

const CHANNEL_LABELS: Record<string, string> = { email: 'Email', whatsapp: 'WhatsApp' }
const CHANNEL_COLORS: Record<string, { bg: string; color: string }> = {
  email:    { bg: '#e0f2fe', color: '#0369a1' },
  whatsapp: { bg: '#f0fdf4', color: '#16a34a' },
}
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  delivered: { bg: '#dcfce7', color: '#15803d' },
  failed:    { bg: '#fee2e2', color: '#dc2626' },
  queued:    { bg: '#fef9c3', color: '#854d0e' },
}
const DAILY_BUSINESS_INSIGHTS = 'daily business insights'
const DAILY_NEWS_SUMMARY = 'daily news summary'

type HistoryGuideStep = {
  key: string
  title: string
  description: string
  points: string[]
  targetId: string
}

const HISTORY_GUIDE_STEPS: HistoryGuideStep[] = [
  {
    key: 'top-nav',
    title: 'Delivery History Workspace',
    description: 'Use this page to audit sent messages, delivery outcomes, and provider activity over time.',
    points: [
      'This log is useful for delivery verification and troubleshooting.',
      'Each row captures channel, target destination, and delivery state.',
    ],
    targetId: 'dashboard-guide-topbar',
  },
  {
    key: 'filters',
    title: 'Filter Controls',
    description: 'Filter the log by channel, status, and date range to isolate relevant delivery windows.',
    points: [
      'Combine filters to narrow large history sets quickly.',
      'Clear filters resets the history view to default.',
    ],
    targetId: 'history-guide-filters',
  },
  {
    key: 'summary',
    title: 'History Summary',
    description: 'This line reports total records and current page details when pagination is active.',
    points: [
      'Use it as a quick sanity check before deep review.',
      'Loading state appears here during query refresh.',
    ],
    targetId: 'history-guide-summary',
  },
  {
    key: 'table',
    title: 'Delivery Table',
    description: 'Inspect each row for time, notification title, channel, destination, status, and provider.',
    points: [
      'Status and channel chips provide at-a-glance readability.',
      'Open action is available only for advisory messages.',
    ],
    targetId: 'history-guide-table',
  },
  {
    key: 'pagination',
    title: 'Pagination',
    description: 'Move between pages when the result set exceeds the selected page size.',
    points: [
      'Prev and Next are disabled at list boundaries.',
      'Filters and pagination work together for targeted audits.',
    ],
    targetId: 'history-guide-pagination',
  },
]

function canOpenInCompose(item: {
  notification_incident_type: string | null
  notification_heading: string | null
}) {
  const incidentType = (item.notification_incident_type ?? '').trim().toLowerCase()
  if (incidentType === DAILY_BUSINESS_INSIGHTS || incidentType === DAILY_NEWS_SUMMARY) {
    return false
  }
  const heading = (item.notification_heading ?? '').trim().toLowerCase()
  if (heading.includes(DAILY_BUSINESS_INSIGHTS) || heading.includes(DAILY_NEWS_SUMMARY)) {
    return false
  }
  return true
}

function Chip({ label, colors }: { label: string; colors: { bg: string; color: string } }) {
  return (
    <span
      className="history-chip"
      style={
        {
          '--history-chip-bg': colors.bg,
          '--history-chip-color': colors.color,
        } as CSSProperties
      }
    >
      {label}
    </span>
  )
}

export default function SentHistoryPage() {
  const { sentHistoryGuideLaunchNonce } = useOutletContext<{
    sentHistoryGuideLaunchNonce: number
  }>()
  const navigate = useNavigate()
  const [filters, setFilters] = useState<DeliveryHistoryFilters>({ page: 1, page_size: 50 })
  const guideDoneTimeoutRef = useRef<number | null>(null)
  const [isGuideActive, setIsGuideActive] = useState(false)
  const [guideStepIndex, setGuideStepIndex] = useState(0)
  const [guidePopoverPosition, setGuidePopoverPosition] = useState({ top: 84, left: 20 })
  const [showGuideDoneMessage, setShowGuideDoneMessage] = useState(false)
  const activeGuideStep = isGuideActive ? HISTORY_GUIDE_STEPS[guideStepIndex] : null

  const setFilter = (key: keyof DeliveryHistoryFilters, value: unknown) =>
    setFilters((prev) => ({ ...prev, [key]: value || undefined, page: 1 }))

  const { data, isFetching } = useQuery({
    queryKey: ['deliveries', filters],
    queryFn: () => deliveryApi.listAll(filters),
  })

  const totalPages = data ? Math.ceil(data.total / (filters.page_size ?? 50)) : 1
  const currentPage = filters.page ?? 1

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
    if (!sentHistoryGuideLaunchNonce) return
    setShowGuideDoneMessage(false)
    setGuideStepIndex(0)
    setIsGuideActive(true)
  }, [sentHistoryGuideLaunchNonce])

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
          if (current >= HISTORY_GUIDE_STEPS.length - 1) {
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
      if (current >= HISTORY_GUIDE_STEPS.length - 1) {
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
    return ` history-guide-target${activeGuideStep.key === stepKey ? ' is-active' : ' is-dimmed'}`
  }, [activeGuideStep, isGuideActive])

  return (
    <section className={`history-page${isGuideActive ? ' is-guide-active' : ''}`}>
      {/* Filter bar */}
      <div id="history-guide-filters" className={`history-filters${guideClassFor('filters')}`}>
        <label className="history-filter-label">
          Channel
          <select
            value={filters.channel ?? ''}
            onChange={(e) => setFilter('channel', e.target.value)}
            className="history-filter-select"
          >
            <option value="">All channels</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </label>

        <label className="history-filter-label">
          Status
          <select
            value={filters.status ?? ''}
            onChange={(e) => setFilter('status', e.target.value)}
            className="history-filter-select"
          >
            <option value="">All statuses</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
            <option value="queued">Queued</option>
          </select>
        </label>

        <label className="history-filter-label">
          From
          <input
            type="date"
            value={filters.date_from ?? ''}
            onChange={(e) => setFilter('date_from', e.target.value)}
          />
        </label>

        <label className="history-filter-label">
          To
          <input
            type="date"
            value={filters.date_to ?? ''}
            onChange={(e) => setFilter('date_to', e.target.value)}
          />
        </label>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => setFilters({ page: 1, page_size: 50 })}
        >
          Clear filters
        </button>
      </div>

      <div id="history-guide-summary" className={`history-summary${guideClassFor('summary')}`}>
        {isFetching
          ? 'Loading…'
          : `${data?.total ?? 0} delivery record${(data?.total ?? 0) !== 1 ? 's' : ''}${data && data.total > (filters.page_size ?? 50) ? ` · page ${currentPage} of ${totalPages}` : ''}`}
      </div>

      <table id="history-guide-table" className={`saved-table${guideClassFor('table')}`}>
        <thead>
          <tr>
            <th align="left">Time</th>
            <th align="left">Notification</th>
            <th align="left">Channel</th>
            <th align="left">Destination</th>
            <th align="left">Status</th>
            <th align="left">Provider</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(data?.items ?? []).map((item) => (
            <tr key={item.id}>
              <td className="history-cell-time">
                {item.sent_at
                  ? formatAppDateTime(item.sent_at, '—')
                  : <span className="history-empty-value">—</span>}
              </td>
              <td className="history-cell-title">
                <div className="history-cell-title-text">
                  {item.notification_heading || `Notification #${item.notification_id}`}
                </div>
              </td>
              <td>
                <Chip
                  label={CHANNEL_LABELS[item.channel] ?? item.channel}
                  colors={CHANNEL_COLORS[item.channel] ?? { bg: '#f1f5f9', color: '#475569' }}
                />
              </td>
              <td className="history-cell-destination">
                {item.destination}
              </td>
              <td>
                <span title={item.error_message ?? undefined}>
                  <Chip
                    label={item.status}
                    colors={STATUS_COLORS[item.status] ?? { bg: '#f1f5f9', color: '#475569' }}
                  />
                </span>
              </td>
              <td className="history-cell-provider">{item.provider}</td>
              <td className="history-row-actions">
                <div className="history-row-actions-inner">
                  {canOpenInCompose(item) ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      title="Open"
                      aria-label="Open"
                      onClick={() => navigate(`/compose?id=${item.notification_id}`)}
                    >
                      {'\u2197'}
                    </button>
                  ) : (
                    <span className="history-row-actions-placeholder" aria-hidden="true" />
                  )}
                </div>
              </td>
            </tr>
          ))}
          {(!data || data.items.length === 0) && !isFetching && (
            <tr>
              <td colSpan={7} className="history-empty">
                No delivery records found.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Pagination */}
      {data && data.total > (filters.page_size ?? 50) && (
        <div id="history-guide-pagination" className={`history-pagination${guideClassFor('pagination')}`}>
          <button
            type="button"
            className="btn-secondary"
            disabled={currentPage <= 1}
            onClick={() => setFilters((prev) => ({ ...prev, page: currentPage - 1 }))}
          >
            ← Prev
          </button>
          <span className="history-pagination-label">Page {currentPage} of {totalPages}</span>
          <button
            type="button"
            className="btn-secondary"
            disabled={currentPage >= totalPages}
            onClick={() => setFilters((prev) => ({ ...prev, page: currentPage + 1 }))}
          >
            Next →
          </button>
        </div>
      )}
      {isGuideActive && activeGuideStep ? (
        <div
          className="history-guide-popover"
          style={{ top: `${guidePopoverPosition.top}px`, left: `${guidePopoverPosition.left}px` }}
          role="dialog"
          aria-modal="false"
          aria-label="Delivery history guide"
        >
          <div className="history-guide-progress">
            Step {guideStepIndex + 1} of {HISTORY_GUIDE_STEPS.length}
          </div>
          <button
            type="button"
            className="history-guide-close-btn btn-danger-action"
            onClick={() => setIsGuideActive(false)}
            aria-label="Close guide"
            title="Close guide"
          >
            <X size={16} />
          </button>
          <h4>{activeGuideStep.title}</h4>
          <p>{activeGuideStep.description}</p>
          <ul className="history-guide-points">
            {activeGuideStep.points.map((point, idx) => (
              <li key={`${activeGuideStep.key}-point-${idx}`}>{point}</li>
            ))}
          </ul>
          <div className="history-guide-controls">
            <button
              type="button"
              className="history-guide-arrow history-guide-arrow--prev"
              onClick={handleGuidePrevious}
              disabled={guideStepIndex === 0}
            >
              Previous
            </button>
            <button
              type="button"
              className="history-guide-arrow history-guide-arrow--next"
              onClick={handleGuideNext}
            >
              {guideStepIndex === HISTORY_GUIDE_STEPS.length - 1 ? 'Finish' : <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      ) : null}
      {showGuideDoneMessage ? (
        <div className="history-guide-done" role="status" aria-live="polite">
          Delivery History guide completed.
        </div>
      ) : null}
    </section>
  )
}

