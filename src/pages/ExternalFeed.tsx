/**
 * Module: External Feed
 * Purpose: Review and shortlist external news candidates for Send Insights.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckSquare, ChevronRight, Loader2, RefreshCw, SendHorizontal, Trash2, X } from 'lucide-react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { externalNewsApi, type ExternalNewsCandidate } from '../api/externalNews'
import { InlineNotice } from '../components/common/InlineNotice'
import {
  candidateKind,
  enqueueShortlistHandoff,
  loadExternalFeedLookbackDays,
  loadExternalShortlist,
  saveExternalFeedLookbackDays,
  saveExternalShortlist,
  type ExternalShortlistState,
} from '../utils/externalShortlist'
import { useAuth } from '../auth/AuthContext'
import { hasFullAccess } from '../utils/authRoles'

type FeedTabKey = 'business' | 'security' | 'all'
type ExternalFeedGuideStep = {
  key: string
  title: string
  description: string
  points: string[]
  targetId: string
}

const FEED_TABS: Array<{ key: FeedTabKey; label: string }> = [
  { key: 'business', label: 'Daily Business Insights' },
  { key: 'security', label: 'Daily News Summary' },
  { key: 'all', label: 'All News' },
]

const DAY_OPTIONS = [
  { label: '1 day', value: 1 },
  { label: '2 days', value: 2 },
  { label: '3 days', value: 3 },
  { label: '7 days', value: 7 },
]
const EXTERNAL_FEED_GUIDE_STEPS: ExternalFeedGuideStep[] = [
  {
    key: 'top-nav',
    title: 'External Feed Overview',
    description: 'Use this page to shortlist external news items for Daily Business Insights and Daily News Summary.',
    points: [
      'This page feeds the Send Insights workflow directly.',
      'Selections are stored separately for business and security tracks.',
    ],
    targetId: 'dashboard-guide-topbar',
  },
  {
    key: 'refresh',
    title: 'Refresh And Data Freshness',
    description: 'Refresh pulls the latest external candidates for the selected lookback window.',
    points: [
      'Use refresh before final shortlist decisions.',
      'Loading state confirms active data fetch.',
    ],
    targetId: 'external-feed-guide-sticky',
  },
  {
    key: 'tabs',
    title: 'Insight Buckets',
    description: 'Switch between business, daily summary, and combined all-news views to manage different editorial goals.',
    points: [
      'Counts on tabs show available items per view.',
      'Tab switch resets scope/category filters for clean exploration.',
    ],
    targetId: 'external-feed-guide-tabs',
  },
  {
    key: 'filters',
    title: 'Lookback And Filters',
    description: 'Use days, category, and geography filters to narrow stories before selection.',
    points: [
      'Category and geography filtering helps reduce noise quickly.',
      'Apply filters first, then bulk-select visible results.',
    ],
    targetId: 'external-feed-guide-filters',
  },
  {
    key: 'actions',
    title: 'Shortlist Controls',
    description: 'Select visible stories, clear shortlist for current view, and send chosen items to Send Insights.',
    points: [
      'Selected count helps verify shortlist size before handoff.',
      'Send transfers selected candidates and opens Send Insights.',
    ],
    targetId: 'external-feed-guide-actions',
  },
  {
    key: 'table',
    title: 'Candidate Review Table',
    description: 'Review title, category, scope, publisher, importance, freshness, duplicates, and source link before selecting.',
    points: [
      'Use source host links for quick credibility checks.',
      'Row checkboxes map each candidate into business or security shortlist.',
    ],
    targetId: 'external-feed-guide-table',
  },
]

const ALL_SCOPES = 'All geographies'
const ALL_CATEGORIES = 'All categories'

function compareByImportance(a: ExternalNewsCandidate, b: ExternalNewsCandidate): number {
  if ((b.importance_score || 0) !== (a.importance_score || 0)) {
    return (b.importance_score || 0) - (a.importance_score || 0)
  }
  const aTime = Date.parse(a.published_at || '') || 0
  const bTime = Date.parse(b.published_at || '') || 0
  if (bTime !== aTime) return bTime - aTime
  return (b.relevance_score || 0) - (a.relevance_score || 0)
}

function uniqueCandidates(candidates: ExternalNewsCandidate[]): ExternalNewsCandidate[] {
  const seen = new Set<string>()
  const output: ExternalNewsCandidate[] = []
  for (const candidate of candidates) {
    const key = String(candidate.canonical_url || candidate.article_url || candidate.title || candidate.id).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(candidate)
  }
  return output
}

function scopeLabel(candidate: ExternalNewsCandidate): string {
  const scope = String(candidate.geography_scope || '').toLowerCase()
  if (scope.includes('international') || scope.includes('global')) return 'International'
  return 'India'
}

function categoryLabel(candidate: ExternalNewsCandidate): string {
  return String(candidate.category_label || 'General')
}

function publisherLabel(candidate: ExternalNewsCandidate): string {
  return String(candidate.publisher || 'External Source')
}

function feedLabel(candidate: ExternalNewsCandidate): string {
  return String(candidate.feed_label || `${publisherLabel(candidate)} Feed`)
}

function latestUpdateLabel(candidate: ExternalNewsCandidate): string {
  return String(candidate.published_at || '-')
}

function duplicateLabel(candidate: ExternalNewsCandidate): string {
  const duplicateCount = Number(candidate.duplicate_count || 0)
  if (duplicateCount <= 0) return 'Primary'
  return `Primary + ${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'}`
}

function primaryLink(candidate: ExternalNewsCandidate): string {
  return String(candidate.article_url || '')
}

function linkHost(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return link || 'Source'
  }
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('a, button, input, select, textarea, label'))
}

function selectedCountFor(state: ExternalShortlistState, tab: FeedTabKey): number {
  if (tab === 'business') return state.business.length
  if (tab === 'security') return state.security.length
  return state.business.length + state.security.length
}

export default function ExternalFeedPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canUseActions = hasFullAccess(user)
  const shortlistScope = user ? `${user.id}:${user.email}` : null
  const { externalFeedGuideLaunchNonce } = useOutletContext<{ externalFeedGuideLaunchNonce: number }>()
  const [activeTab, setActiveTab] = useState<FeedTabKey>('business')
  const [days, setDays] = useState(() => loadExternalFeedLookbackDays())
  const [selectedScope, setSelectedScope] = useState(ALL_SCOPES)
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [shortlist, setShortlist] = useState<ExternalShortlistState>(() =>
    canUseActions ? loadExternalShortlist(shortlistScope) : { business: [], security: [] },
  )
  const guideDoneTimeoutRef = useRef<number | null>(null)
  const [isGuideActive, setIsGuideActive] = useState(false)
  const [guideStepIndex, setGuideStepIndex] = useState(0)
  const [guidePopoverPosition, setGuidePopoverPosition] = useState({ top: 84, left: 20 })
  const [showGuideDoneMessage, setShowGuideDoneMessage] = useState(false)
  const activeGuideStep = isGuideActive ? EXTERNAL_FEED_GUIDE_STEPS[guideStepIndex] : null

  useEffect(() => {
    if (canUseActions) {
      saveExternalShortlist(shortlist, shortlistScope)
    }
  }, [canUseActions, shortlist, shortlistScope])

  useEffect(() => {
    setShortlist(canUseActions ? loadExternalShortlist(shortlistScope) : { business: [], security: [] })
  }, [canUseActions, shortlistScope])

  useEffect(() => {
    saveExternalFeedLookbackDays(days)
  }, [days])

  const businessQuery = useQuery({
    queryKey: ['external-feed-news', 'business', days, refreshNonce],
    queryFn: () => externalNewsApi.listInsightsNews('business', 250, days),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const securityQuery = useQuery({
    queryKey: ['external-feed-news', 'security', days, refreshNonce],
    queryFn: () => externalNewsApi.listInsightsNews('security', 250, days),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const countsQuery = useQuery({
    queryKey: ['external-feed-news-counts', days, refreshNonce],
    queryFn: () => externalNewsApi.listInsightCounts(days),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const businessItems = useMemo(
    () => [...(businessQuery.data?.items || [])].sort(compareByImportance),
    [businessQuery.data],
  )
  const securityItems = useMemo(
    () => [...(securityQuery.data?.items || [])].sort(compareByImportance),
    [securityQuery.data],
  )

  const activeItems = useMemo(() => {
    if (activeTab === 'business') return businessItems
    if (activeTab === 'security') return securityItems
    return uniqueCandidates([...businessItems, ...securityItems]).sort(compareByImportance)
  }, [activeTab, businessItems, securityItems])

  const scopeOptions = useMemo(
    () => [ALL_SCOPES, ...Array.from(new Set(activeItems.map(scopeLabel))).sort((a, b) => a.localeCompare(b))],
    [activeItems],
  )

  const categoryOptions = useMemo(
    () => [ALL_CATEGORIES, ...Array.from(new Set(activeItems.map(categoryLabel))).sort((a, b) => a.localeCompare(b))],
    [activeItems],
  )

  const visibleItems = useMemo(
    () => activeItems
      .filter((item) => selectedScope === ALL_SCOPES || scopeLabel(item) === selectedScope)
      .filter((item) => selectedCategory === ALL_CATEGORIES || categoryLabel(item) === selectedCategory),
    [activeItems, selectedCategory, selectedScope],
  )

  const isLoading = businessQuery.isLoading || securityQuery.isLoading
  const isFetching = businessQuery.isFetching || securityQuery.isFetching || countsQuery.isFetching
  const error = businessQuery.error || securityQuery.error || countsQuery.error

  const tabCountByKey: Record<FeedTabKey, number> = {
    business: countsQuery.data?.business ?? businessQuery.data?.total_available ?? businessItems.length,
    security: countsQuery.data?.security ?? securityQuery.data?.total_available ?? securityItems.length,
    all: countsQuery.data?.all ?? uniqueCandidates([...businessItems, ...securityItems]).length,
  }

  const isSelected = (candidate: ExternalNewsCandidate): boolean => {
    const kind = candidateKind(candidate)
    return shortlist[kind].includes(candidate.id)
  }

  const setSelected = (candidate: ExternalNewsCandidate, checked: boolean) => {
    if (!canUseActions) return
    const kind = candidateKind(candidate)
    setShortlist((prev) => {
      const current = new Set(prev[kind])
      if (checked) current.add(candidate.id)
      else current.delete(candidate.id)
      return { ...prev, [kind]: Array.from(current) }
    })
  }

  const selectVisible = () => {
    if (!canUseActions) return
    setShortlist((prev) => {
      const nextBusiness = new Set(prev.business)
      const nextSecurity = new Set(prev.security)
      visibleItems.forEach((item) => {
        const kind = candidateKind(item)
        if (kind === 'business') nextBusiness.add(item.id)
        else nextSecurity.add(item.id)
      })
      return { business: Array.from(nextBusiness), security: Array.from(nextSecurity) }
    })
  }

  const clearAllForTab = () => {
    if (!canUseActions) return
    setShortlist((prev) => {
      if (activeTab === 'business') return { ...prev, business: [] }
      if (activeTab === 'security') return { ...prev, security: [] }
      return { business: [], security: [] }
    })
  }

  const selectedCount = selectedCountFor(shortlist, activeTab)

  const sendSelectedToInsights = () => {
    if (!canUseActions) return
    if (!shortlist.business.length && !shortlist.security.length) return
    const businessSet = new Set(shortlist.business)
    const securitySet = new Set(shortlist.security)
    const selectedBusiness = businessItems.filter((item) => businessSet.has(item.id))
    const selectedSecurity = securityItems.filter((item) => securitySet.has(item.id))
    const target = activeTab === 'business'
      ? 'business'
      : activeTab === 'security'
        ? 'security'
        : 'both'
    enqueueShortlistHandoff(target, selectedBusiness, selectedSecurity, shortlistScope)
    navigate('/send-insights')
  }

  const handleTileActivate = (
    event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>,
    handler: () => void,
  ) => {
    if ('key' in event) {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      handler()
      return
    }
    if (isInteractiveTarget(event.target)) return
    handler()
  }

  const finishGuide = useCallback(() => {
    setIsGuideActive(false)
    setGuideStepIndex(0)
    setShowGuideDoneMessage(true)
    if (guideDoneTimeoutRef.current) window.clearTimeout(guideDoneTimeoutRef.current)
    guideDoneTimeoutRef.current = window.setTimeout(() => setShowGuideDoneMessage(false), 2200)
  }, [])

  useEffect(() => () => {
    if (guideDoneTimeoutRef.current) window.clearTimeout(guideDoneTimeoutRef.current)
  }, [])

  useEffect(() => {
    if (!externalFeedGuideLaunchNonce) return
    setShowGuideDoneMessage(false)
    setGuideStepIndex(0)
    setIsGuideActive(true)
  }, [externalFeedGuideLaunchNonce])

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
      let left = targetRect.left
      if (left + popoverWidth > viewportWidth - margin) left = viewportWidth - popoverWidth - margin
      if (left < margin) left = margin
      let top = targetRect.bottom + 12
      if (top + 280 > viewportHeight - margin) top = targetRect.top - 300
      const minTop = Math.max(topbarBottom + 10, margin)
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
          if (current >= EXTERNAL_FEED_GUIDE_STEPS.length - 1) {
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
      if (current >= EXTERNAL_FEED_GUIDE_STEPS.length - 1) {
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
    return ` external-feed-guide-target${activeGuideStep.key === stepKey ? ' is-active' : ' is-dimmed'}`
  }, [activeGuideStep, isGuideActive])

  return (
    <section className={`datasurfr-page datasurfr-page--pro external-feed-page${isGuideActive ? ' is-guide-active' : ''}`}>
      <div id="external-feed-guide-sticky" className={`datasurfr-sticky-head${guideClassFor('refresh')}`}>
        <div className="datasurfr-head-top">
          <div className="datasurfr-head-left">
            <div className="datasurfr-head-help">
              External news candidates for Daily Business Insights and Daily News Summary. Select stories to push into insight shortlists.
            </div>
          </div>
          <div className="datasurfr-head-right">
            <div className="datasurfr-head-actions">
              <button
                className="btn-secondary btn-success-action datasurfr-icon-btn"
                onClick={() => setRefreshNonce((current) => current + 1)}
                disabled={isFetching}
                aria-label={isFetching ? 'Refreshing external news' : 'Refresh external news'}
                title={isFetching ? 'Refreshing external news' : 'Refresh external news'}
              >
                {isFetching ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <InlineNotice tone="danger">
          {error instanceof Error ? error.message : 'Failed to load external news.'}
        </InlineNotice>
      ) : null}

      <div className="datasurfr-stream-head datasurfr-stream-head--table external-feed-stream-head">
        <h3 className="datasurfr-stream-title external-feed-title-top">
          {FEED_TABS.find((tab) => tab.key === activeTab)?.label || 'External News'}
        </h3>
        <div className="external-feed-layout-grid">
          <div className="external-feed-line2-left">
            <div id="external-feed-guide-tabs" className={`datasurfr-tabs external-feed-tabs-left${guideClassFor('tabs')}`}>
              {FEED_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`datasurfr-tab${activeTab === tab.key ? ' is-active' : ''}`}
                  onClick={() => {
                    setActiveTab(tab.key)
                    setSelectedScope(ALL_SCOPES)
                    setSelectedCategory(ALL_CATEGORIES)
                  }}
                >
                  {tab.label}
                  <span className="datasurfr-tab-count">{tabCountByKey[tab.key]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="external-feed-line2-right">
            <div id="external-feed-guide-filters" className={`external-feed-inline-filters${guideClassFor('filters')}`}>
              <select
                aria-label="Select external feed lookback"
                value={days}
                className="datasurfr-category-view-select"
                onChange={(event) => setDays(Number(event.target.value))}
              >
                {DAY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter external news by category"
                value={selectedCategory}
                className="datasurfr-category-view-select"
                onChange={(event) => setSelectedCategory(event.target.value)}
              >
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter external news by geography"
                value={selectedScope}
                className="datasurfr-category-view-select"
                onChange={(event) => setSelectedScope(event.target.value)}
              >
                {scopeOptions.map((scope) => (
                  <option key={scope} value={scope}>
                    {scope}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="external-feed-line3-right">
            {canUseActions ? (
            <div id="external-feed-guide-actions" className={`external-feed-controls-row external-feed-controls-row-right${guideClassFor('actions')}`}>
              <button
                type="button"
                className="btn-secondary btn-danger-action datasurfr-icon-btn"
                onClick={selectVisible}
                title="Select all visible items"
                aria-label="Select all visible items"
              >
                <CheckSquare size={14} />
              </button>
              <button
                type="button"
                className="btn-secondary datasurfr-icon-btn"
                onClick={clearAllForTab}
                title="Clear shortlist"
                aria-label="Clear shortlist"
              >
                <Trash2 size={14} />
              </button>
              <button
                type="button"
                className="btn-primary external-feed-send-btn"
                onClick={sendSelectedToInsights}
                disabled={!shortlist.business.length && !shortlist.security.length}
                title="Send selected items to templates"
                aria-label="Send selected items to templates"
              >
                <SendHorizontal size={14} />
              </button>
              <span className="datasurfr-tab-count external-feed-selected-chip" title="Selected shortlist count">
                Selected: {selectedCount}
              </span>
            </div>
            ) : null}
          </div>
        </div>
      </div>

      <div id="external-feed-guide-table" className={`datasurfr-table-view${guideClassFor('table')}`}>
        <table className="datasurfr-table">
          <thead>
            <tr>
              <th className="datasurfr-col-select">Select</th>
              <th className="datasurfr-col-title">News</th>
              <th className="datasurfr-col-risk">Category</th>
              <th className="datasurfr-col-location">India / International</th>
              <th className="datasurfr-col-location">Publisher</th>
              <th className="datasurfr-col-location">Importance</th>
              <th className="datasurfr-col-update">Latest Update</th>
              <th className="datasurfr-col-location">Duplicates</th>
              <th className="datasurfr-col-sources">Source</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((candidate) => {
              const link = primaryLink(candidate)
              const checked = isSelected(candidate)
              return (
                <tr
                  key={`${activeTab}-${candidate.id}`}
                  className={`datasurfr-table-row${checked ? ' is-selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={checked}
                  onClick={(event) => handleTileActivate(event, () => setSelected(candidate, !checked))}
                  onKeyDown={(event) => handleTileActivate(event, () => setSelected(candidate, !checked))}
                >
                  <td className="datasurfr-table-cell datasurfr-table-cell-select" />
                  <td className="datasurfr-table-cell datasurfr-table-cell-wrap">
                    <div className="datasurfr-table-title">{candidate.title}</div>
                    <div className="datasurfr-table-meta datasurfr-table-meta-spaced">{feedLabel(candidate)}</div>
                    {candidate.description ? (
                      <div className="datasurfr-table-desc datasurfr-table-desc-spaced">
                        {candidate.description.slice(0, 260)}
                        {candidate.description.length > 260 ? '...' : ''}
                      </div>
                    ) : null}
                  </td>
                  <td className="datasurfr-table-cell datasurfr-table-cell-wrap">{categoryLabel(candidate)}</td>
                  <td className="datasurfr-table-cell datasurfr-table-cell-wrap">{scopeLabel(candidate)}</td>
                  <td className="datasurfr-table-cell datasurfr-table-cell-wrap">{publisherLabel(candidate)}</td>
                  <td className="datasurfr-table-cell datasurfr-table-cell-wrap">{candidate.importance_score}</td>
                  <td className="datasurfr-table-cell datasurfr-table-cell-wrap">{latestUpdateLabel(candidate)}</td>
                  <td className="datasurfr-table-cell datasurfr-table-cell-wrap">{duplicateLabel(candidate)}</td>
                  <td className="datasurfr-table-cell datasurfr-table-cell-wrap">
                    {link ? (
                      <a href={link} target="_blank" rel="noreferrer" className="datasurfr-source-link" title={link}>
                        {linkHost(link)}
                      </a>
                    ) : (
                      <span className="datasurfr-no-links">No link</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {!isLoading && visibleItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="datasurfr-empty-row">
                  No external news items match the selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="datasurfr-card-view">
        {visibleItems.map((candidate) => {
          const link = primaryLink(candidate)
          const checked = isSelected(candidate)
          return (
            <article
              key={`${activeTab}-${candidate.id}-card`}
              className={`datasurfr-alert-card${checked ? ' is-selected' : ''}`}
              role="button"
              tabIndex={0}
              aria-pressed={checked}
              onClick={(event) => handleTileActivate(event, () => setSelected(candidate, !checked))}
              onKeyDown={(event) => handleTileActivate(event, () => setSelected(candidate, !checked))}
            >
              <div className="datasurfr-alert-header">
                <div className="datasurfr-alert-copy">
                  <div className="datasurfr-alert-title">{candidate.title}</div>
                  <div className="datasurfr-alert-meta">{feedLabel(candidate)}</div>
                </div>
              </div>

              {candidate.description ? (
                <div className="datasurfr-alert-desc">
                  {candidate.description.slice(0, 220)}
                  {candidate.description.length > 220 ? '...' : ''}
                </div>
              ) : null}

              <div className="datasurfr-alert-grid">
                <div className="datasurfr-alert-block">
                  <div className="datasurfr-alert-label">Category</div>
                  <div className="datasurfr-alert-value">{categoryLabel(candidate)}</div>
                </div>
                <div className="datasurfr-alert-block">
                  <div className="datasurfr-alert-label">India / International</div>
                  <div className="datasurfr-alert-value">{scopeLabel(candidate)}</div>
                </div>
                <div className="datasurfr-alert-block">
                  <div className="datasurfr-alert-label">Publisher</div>
                  <div className="datasurfr-alert-value">{publisherLabel(candidate)}</div>
                </div>
                <div className="datasurfr-alert-block">
                  <div className="datasurfr-alert-label">Importance</div>
                  <div className="datasurfr-alert-value">{candidate.importance_score}</div>
                </div>
                <div className="datasurfr-alert-block">
                  <div className="datasurfr-alert-label">Latest Update</div>
                  <div className="datasurfr-alert-value">{latestUpdateLabel(candidate)}</div>
                </div>
              </div>

              <div className="datasurfr-alert-block">
                <div className="datasurfr-alert-label">Source</div>
                {link ? (
                  <div className="datasurfr-alert-links">
                    <a href={link} target="_blank" rel="noreferrer" title={link}>
                      {linkHost(link)}
                    </a>
                  </div>
                ) : (
                  <span className="datasurfr-no-links">No link</span>
                )}
              </div>
            </article>
          )
        })}
        {!isLoading && visibleItems.length === 0 ? (
          <div className="datasurfr-empty-card">
            No external news items match the selected filters.
          </div>
        ) : null}
      </div>
      {isGuideActive && activeGuideStep ? (
        <div
          className="external-feed-guide-popover"
          style={{ top: `${guidePopoverPosition.top}px`, left: `${guidePopoverPosition.left}px` }}
          role="dialog"
          aria-modal="false"
          aria-label="External feed guide"
        >
          <div className="external-feed-guide-progress">Step {guideStepIndex + 1} of {EXTERNAL_FEED_GUIDE_STEPS.length}</div>
          <button
            type="button"
            className="external-feed-guide-close-btn btn-danger-action"
            onClick={() => setIsGuideActive(false)}
            aria-label="Close guide"
            title="Close guide"
          >
            <X size={16} />
          </button>
          <h4>{activeGuideStep.title}</h4>
          <p>{activeGuideStep.description}</p>
          <ul className="external-feed-guide-points">
            {activeGuideStep.points.map((point, idx) => (
              <li key={`${activeGuideStep.key}-${idx}`}>{point}</li>
            ))}
          </ul>
          <div className="external-feed-guide-controls">
            <button type="button" className="external-feed-guide-arrow external-feed-guide-arrow--prev" onClick={handleGuidePrevious} disabled={guideStepIndex === 0}>
              Previous
            </button>
            <button type="button" className="external-feed-guide-arrow external-feed-guide-arrow--next" onClick={handleGuideNext}>
              {guideStepIndex === EXTERNAL_FEED_GUIDE_STEPS.length - 1 ? 'Finish' : <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      ) : null}
      {showGuideDoneMessage ? (
        <div className="external-feed-guide-done" role="status" aria-live="polite">
          External Feed guide completed.
        </div>
      ) : null}
    </section>
  )
}
