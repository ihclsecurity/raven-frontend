/**
 * Module: Datasurfrfeed
 * Purpose: Core module responsible for Datasurfrfeed concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckSquare, ChevronRight, Download, ExternalLink, Loader2, Save, SquareX, X } from 'lucide-react'
import { datasurfrApi } from '../api/datasurfr'
import type { DatasurfrAlert, DatasurfrImportResponse } from '../types/datasurfr'
import { FEED_WINDOW_OPTIONS } from '../constants/feedWindows'
import { ALERT_CATEGORY_OPTIONS, type AlertCategoryKey, categorizeAlert, createAlertCategoryCounts } from '../constants/taxonomy'
import { InlineNotice } from '../components/common/InlineNotice'
import type { FeedTopBarControls } from '../components/layout/AppShell'
import { useAuth } from '../auth/AuthContext'
import { hasFullAccess } from '../utils/authRoles'
import { formatAppTime } from '../utils/dateTime'

const PROPERTY_PREVIEW_LIMIT = 20
const UNMAPPED_REGION_LABEL = 'Needs Region Mapping'

type FeedTabKey = 'priority' | 'region_priority' | 'all_news'

type DatasurfrGuideStep = {
  key: string
  title: string
  description: string
  points: string[]
  targetId: string
}

const DATASURFR_GUIDE_STEPS: DatasurfrGuideStep[] = [
  {
    key: 'top-nav',
    title: 'Datasurfr Feed Overview',
    description: 'Use this page to review incoming feed alerts, select relevant items, and convert them into draft advisories or source summaries.',
    points: [
      'This page supports both single-alert and bulk workflows.',
      'Selections persist while you switch between tab views.',
    ],
    targetId: 'dashboard-guide-topbar',
  },
  {
    key: 'control-bar',
    title: 'Control Bar And Actions',
    description: 'Use the sticky control bar to change time window, refresh feed, export to Excel, and run selection actions.',
    points: [
      'Import is best for a single selected alert that you want to open in Compose.',
      'Save and Create Summary are used for multi-alert workflows.',
    ],
    targetId: 'datasurfr-guide-sticky-head',
  },
  {
    key: 'tabs',
    title: 'Feed Views',
    description: 'Switch between All News, Priority Alerts, and Region Wise Priority Alerts to focus analysis.',
    points: [
      'Priority views are impact-focused and sorted by score and freshness.',
      'All News gives the complete table/card coverage view.',
    ],
    targetId: 'datasurfr-guide-tabs',
  },
  {
    key: 'region-filter',
    title: 'Region-Wise Prioritization',
    description: 'In region-priority mode, choose a region to import with that region scope and review mapped-property impact.',
    points: [
      'Unmapped region items can still be imported with event-scoped mapping.',
      'Category filter still applies after region selection.',
    ],
    targetId: 'datasurfr-guide-region-filter',
  },
  {
    key: 'priority-stream',
    title: 'Priority Alert Review',
    description: 'Priority cards highlight high-impact alerts with score, recency, reasons, and affected-property context.',
    points: [
      'Use checkboxes to select alerts for import or batch save.',
      'Property context helps determine advisory urgency and scope.',
    ],
    targetId: 'datasurfr-guide-priority-stream',
  },
  {
    key: 'all-news-table',
    title: 'All News Deep Review',
    description: 'All News view provides comprehensive row-level inspection with links for source verification.',
    points: [
      'Use this mode for broad scanning before narrowing to priority.',
      'Select rows here when you need full-field context before import.',
    ],
    targetId: 'datasurfr-guide-all-news-table',
  },
]

// Top-level feed views shown in the sticky selector.
const FEED_TABS: Array<{ key: FeedTabKey; label: string }> = [
  { key: 'all_news', label: 'All News' },
  { key: 'priority', label: 'Priority Alerts' },
  { key: 'region_priority', label: 'Region Wise Priority Alerts' },
]

// Human-friendly source label fallback for URLs that fail URL parsing.
function getLinkLabel(link: string, index: number) {
  try {
    const url = new URL(link)
    const hostname = url.hostname.replace(/^www\./, '')
    return `${hostname} (${index + 1})`
  } catch {
    return `Source ${index + 1}`
  }
}

// Stable dedupe helper used by impacted-properties and region lists.
function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const raw of values) {
    const item = String(raw || '').trim()
    if (!item) continue
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(item)
  }
  return output
}

// Prefer full impacted property list, then fallback to preview list.
function impactedPropertiesForAlert(alert: DatasurfrAlert): string[] {
  const all = uniqueStrings(alert.impacted_properties_all || [])
  if (all.length) {
    return all
  }
  return uniqueStrings(alert.impacted_properties_preview || [])
}

// Resolve a single primary region for region-wise grouping and tab counts.
function firstMappedRegion(alert: DatasurfrAlert): string | null {
  const primaryRegion = String(alert.primary_mapped_region || '').trim()
  if (primaryRegion) {
    return primaryRegion
  }
  const regions = uniqueStrings(alert.mapped_regions || [])
  return regions.length ? regions[0] : null
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('a, button, input, select, textarea, label'))
}

export default function DatasurfrFeedPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canUseActions = hasFullAccess(user)
  const {
    sharedFeedTimeWindow,
    setSharedFeedTimeWindow,
    feedRefreshNonce,
    triggerFeedRefresh,
    datasurfrGuideLaunchNonce,
    setFeedTopBarControls,
  } = useOutletContext<{
    sharedFeedTimeWindow: number
    setSharedFeedTimeWindow: (value: number) => void
    feedRefreshNonce: number
    triggerFeedRefresh: () => void
    datasurfrGuideLaunchNonce: number
    setFeedTopBarControls: (controls: FeedTopBarControls | null) => void
  }>()
  const [selectedByAlert, setSelectedByAlert] = useState<Record<string, string | null>>({})
  const [selectedRegionFilter, setSelectedRegionFilter] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const [activeTab, setActiveTab] = useState<FeedTabKey>('priority')
  const [selectedCategoryByTab, setSelectedCategoryByTab] = useState<Record<FeedTabKey, AlertCategoryKey>>({
    priority: 'all',
    region_priority: 'all',
    all_news: 'all',
  })
  const [expandedProperties, setExpandedProperties] = useState<Record<string, boolean>>({})
  const [skipDetails, setSkipDetails] = useState<Array<{ alert_id: string; reason: string }>>([])
  const [importedItems, setImportedItems] = useState<Array<{ alert_id: string; notification_id: number; heading: string | null; status: string; region?: string | null }>>([])
  const guideDoneTimeoutRef = useRef<number | null>(null)
  const [isGuideActive, setIsGuideActive] = useState(false)
  const [guideStepIndex, setGuideStepIndex] = useState(0)
  const [guidePopoverPosition, setGuidePopoverPosition] = useState({ top: 84, left: 20 })
  const [showGuideDoneMessage, setShowGuideDoneMessage] = useState(false)
  const activeGuideStep = isGuideActive ? DATASURFR_GUIDE_STEPS[guideStepIndex] : null
  const nowLabel = formatAppTime()

  useEffect(() => {
    setFeedTopBarControls({
      timeWindow: sharedFeedTimeWindow,
      windowOptions: [...FEED_WINDOW_OPTIONS],
      onTimeWindowChange: setSharedFeedTimeWindow,
      onRefresh: triggerFeedRefresh,
      liveLabel: nowLabel,
      refreshLabel: 'Refresh Datasurfr feed',
    })
    return () => setFeedTopBarControls(null)
  }, [nowLabel, setFeedTopBarControls, setSharedFeedTimeWindow, sharedFeedTimeWindow, triggerFeedRefresh])

  const { data: alerts = [], isLoading, error } = useQuery({
    queryKey: ['datasurfr-alerts', sharedFeedTimeWindow, feedRefreshNonce],
    queryFn: () => datasurfrApi.listAlerts(sharedFeedTimeWindow),
    staleTime: 60000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

  // Priority tab source: high-impact alerts sorted by score first, recency second.
  const highImpactAlerts = useMemo(
    () => alerts
      .filter((alert) => alert.hotel_impact_level === 'high')
      .sort((a, b) => {
        if (b.hotel_impact_score !== a.hotel_impact_score) {
          return b.hotel_impact_score - a.hotel_impact_score
        }
        const aAge = a.latest_update_age_minutes ?? Number.MAX_SAFE_INTEGER
        const bAge = b.latest_update_age_minutes ?? Number.MAX_SAFE_INTEGER
        return aAge - bAge
      }),
    [alerts],
  )

  // Region-wise priority tab source: group high-impact alerts by primary region.
  const regionPriorityGroups = useMemo(() => {
    const byRegion = new Map<string, DatasurfrAlert[]>()
    for (const alert of highImpactAlerts) {
      const primaryRegion = firstMappedRegion(alert) || UNMAPPED_REGION_LABEL
      if (!byRegion.has(primaryRegion)) {
        byRegion.set(primaryRegion, [])
      }
      byRegion.get(primaryRegion)?.push(alert)
    }

    return Array.from(byRegion.entries())
      .map(([region, regionAlerts]) => ({
        region,
        alerts: uniqueStrings(regionAlerts.map((item) => item.id))
          .map((id) => regionAlerts.find((item) => item.id === id))
          .filter((item): item is DatasurfrAlert => Boolean(item))
          .sort((a, b) => {
            if (b.hotel_impact_score !== a.hotel_impact_score) {
              return b.hotel_impact_score - a.hotel_impact_score
            }
            const aAge = a.latest_update_age_minutes ?? Number.MAX_SAFE_INTEGER
            const bAge = b.latest_update_age_minutes ?? Number.MAX_SAFE_INTEGER
            return aAge - bAge
          }),
      }))
      .sort((a, b) => {
        if (b.alerts.length !== a.alerts.length) {
          return b.alerts.length - a.alerts.length
        }
        if (a.region === UNMAPPED_REGION_LABEL) return 1
        if (b.region === UNMAPPED_REGION_LABEL) return -1
        return a.region.localeCompare(b.region)
      })
  }, [highImpactAlerts])

  // Used for tab count and selection behavior without re-scanning all groups.
  const regionPreferredByAlert = useMemo(() => {
    const output: Record<string, string> = {}
    for (const group of regionPriorityGroups) {
      for (const alert of group.alerts) {
        if (!output[alert.id]) {
          output[alert.id] = group.region
        }
      }
    }
    return output
  }, [regionPriorityGroups])

  // Region selector options in region-wise tab (ordered by group ranking).
  const regionOptions = useMemo(
    () => regionPriorityGroups.map((group) => group.region),
    [regionPriorityGroups],
  )

  const selectedRegionGroup = useMemo(
    () => regionPriorityGroups.find((group) => group.region === selectedRegionFilter) || null,
    [regionPriorityGroups, selectedRegionFilter],
  )

  const activeCategory = selectedCategoryByTab[activeTab]

  // Core active dataset used by category chips (depends on selected tab).
  const activeTabAlerts = useMemo(() => {
    if (activeTab === 'priority') {
      return highImpactAlerts
    }
    if (activeTab === 'region_priority') {
      return selectedRegionGroup?.alerts || []
    }
    return alerts
  }, [activeTab, alerts, highImpactAlerts, selectedRegionGroup])

  const categoryCountByKey = useMemo(() => {
    return createAlertCategoryCounts(activeTabAlerts)
  }, [activeTabAlerts])

  // Pre-filtered datasets for each tab to keep render branch logic simple.
  const filteredHighImpactAlerts = useMemo(
    () => highImpactAlerts.filter((alert) => activeCategory === 'all' || categorizeAlert(alert) === activeCategory),
    [highImpactAlerts, activeCategory],
  )

  const filteredSelectedRegionAlerts = useMemo(() => {
    const source = selectedRegionGroup?.alerts || []
    return source.filter((alert) => activeCategory === 'all' || categorizeAlert(alert) === activeCategory)
  }, [selectedRegionGroup, activeCategory])

  const filteredAllAlerts = useMemo(
    () => alerts.filter((alert) => activeCategory === 'all' || categorizeAlert(alert) === activeCategory),
    [alerts, activeCategory],
  )

  // Selection payload includes optional region override for region-wise imports.
  const buildSelectedImportPayload = (includeRegionOverrides = true) => ({
    selections: Object.entries(selectedByAlert).map(([alert_id, region]) => ({
      alert_id,
      ...(includeRegionOverrides && region ? { region } : {}),
    })),
    time: sharedFeedTimeWindow,
  })

  const handleImportResponse = (
    result: DatasurfrImportResponse,
    options: { navigateIfSingle: boolean; actionLabel: 'Imported' | 'Saved' },
  ) => {
    setImportedItems(result.imported)
    setSkipDetails(result.skipped)
    if (options.navigateIfSingle && result.imported.length === 1) {
      navigate(`/compose?id=${result.imported[0].notification_id}`)
      return
    }
    setMessage(
      `${options.actionLabel} ${result.imported.length} alert${result.imported.length === 1 ? '' : 's'}`
      + `${result.skipped.length ? `, skipped ${result.skipped.length}` : ''}.`,
    )
    setSelectedByAlert({})
  }

  const importMutation = useMutation({
    mutationFn: () =>
      datasurfrApi.importAlerts(buildSelectedImportPayload(true)),
    onSuccess: (result) => {
      handleImportResponse(result, { navigateIfSingle: true, actionLabel: 'Imported' })
    },
    onError: (mutationError) => {
      setImportedItems([])
      const text = mutationError instanceof Error ? mutationError.message : 'Import failed.'
      setSkipDetails([])
      setMessage(text)
    },
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      datasurfrApi.importAlerts(buildSelectedImportPayload(true)),
    onSuccess: (result) => {
      handleImportResponse(result, { navigateIfSingle: false, actionLabel: 'Saved' })
    },
    onError: (mutationError) => {
      setImportedItems([])
      const text = mutationError instanceof Error ? mutationError.message : 'Save failed.'
      setSkipDetails([])
      setMessage(text)
    },
  })

  const eventsSummaryMutation = useMutation({
    mutationFn: () =>
      datasurfrApi.importEventsSummary(buildSelectedImportPayload(false)),
    onSuccess: (result) => {
      setImportedItems([])
      setSkipDetails(result.skipped || [])
      setSelectedByAlert({})
      setMessage(
        `Created source summary from ${result.selected_event_count} alert${result.selected_event_count === 1 ? '' : 's'}.`,
      )
      navigate(`/compose?id=${result.notification_id}`)
    },
    onError: (mutationError) => {
      setImportedItems([])
      setSkipDetails([])
      const text = mutationError instanceof Error ? mutationError.message : 'Could not create source summary.'
      setMessage(text)
    },
  })
  const exportFeedMutation = useMutation({
    mutationFn: () => datasurfrApi.exportFeedExcel(sharedFeedTimeWindow),
    onSuccess: (blob) => {
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `datasurfr_feed_${sharedFeedTimeWindow}m_${ts}.xlsx`
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
      setMessage('Feed exported to Excel.')
    },
    onError: (mutationError) => {
      const text = mutationError instanceof Error ? mutationError.message : 'Could not export feed.'
      setMessage(text)
    },
  })

  const selectedAlertIds = useMemo(() => new Set(Object.keys(selectedByAlert)), [selectedByAlert])
  const selectedCount = selectedAlertIds.size
  const canImportSingle = selectedCount === 1
  const canSaveMultiple = selectedCount > 1
  const canCreateSummary = selectedCount > 1
  const actionPending = importMutation.isPending || saveMutation.isPending || eventsSummaryMutation.isPending

  // Keep selection valid when feed refresh drops old alert IDs from current window.
  useEffect(() => {
    const validIds = new Set(alerts.map((alert) => alert.id))
    setSelectedByAlert((prev) => {
      const nextEntries = Object.entries(prev).filter(([alertId]) => validIds.has(alertId))
      if (nextEntries.length === Object.keys(prev).length) {
        return prev
      }
      return Object.fromEntries(nextEntries)
    })
  }, [alerts])

  // Reset selected region filter if current region no longer exists after refresh.
  useEffect(() => {
    if (!selectedRegionFilter) {
      return
    }
    if (!regionOptions.includes(selectedRegionFilter)) {
      setSelectedRegionFilter('')
    }
  }, [regionOptions, selectedRegionFilter])

  // Toggle is stateful by alert + optional region context in region-wise view.
  const toggleSelection = (alertId: string, regionOverride?: string | null) => {
    if (!canUseActions) return
    const normalizedRegion = regionOverride ? String(regionOverride).trim() || null : null
    setSelectedByAlert((prev) => {
      const next = { ...prev }
      const current = Object.prototype.hasOwnProperty.call(next, alertId) ? next[alertId] : undefined
      if (current === normalizedRegion) {
        delete next[alertId]
      } else {
        next[alertId] = normalizedRegion
      }
      return next
    })
  }

  const isSelectedForRegion = (alertId: string, region: string) => {
    const expected = region === UNMAPPED_REGION_LABEL ? null : region
    return Object.prototype.hasOwnProperty.call(selectedByAlert, alertId) && selectedByAlert[alertId] === expected
  }

  const isSelected = (alertId: string) => Object.prototype.hasOwnProperty.call(selectedByAlert, alertId)

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

  // Bulk select respects current tab context and active category filtering.
  const selectAllInTab = () => {
    if (!canUseActions) return
    setSelectedByAlert((prev) => {
      const next = { ...prev }
      if (activeTab === 'all_news') {
        for (const alert of filteredAllAlerts) {
          next[alert.id] = null
        }
      } else if (activeTab === 'priority') {
        for (const alert of filteredHighImpactAlerts) {
          next[alert.id] = null
        }
      } else {
        if (!selectedRegionGroup) {
          return next
        }
        for (const alert of filteredSelectedRegionAlerts) {
          next[alert.id] = selectedRegionGroup.region === UNMAPPED_REGION_LABEL ? null : selectedRegionGroup.region
        }
      }
      return next
    })
  }

  const clearSelection = () => {
    if (!canUseActions) return
    setSelectedByAlert({})
  }

  // Number of selectable alerts in the currently visible tab/filter context.
  const selectableCount = useMemo(() => {
    if (activeTab === 'all_news') {
      return filteredAllAlerts.length
    }
    if (activeTab === 'priority') {
      return filteredHighImpactAlerts.length
    }
    if (!selectedRegionGroup) {
      return 0
    }
    return filteredSelectedRegionAlerts.length
  }, [activeTab, filteredAllAlerts.length, filteredHighImpactAlerts.length, selectedRegionGroup, filteredSelectedRegionAlerts.length])

  const toggleExpandedProperties = (alertId: string) => {
    setExpandedProperties((prev) => ({ ...prev, [alertId]: !prev[alertId] }))
  }

  const renderSourceOpenButton = (alert: DatasurfrAlert, compact = false) => {
    const primaryLink = alert.source_links?.[0]
    if (!primaryLink) return null

    return (
      <a
        href={primaryLink}
        target="_blank"
        rel="noreferrer"
        className={`datasurfr-open-source${compact ? ' datasurfr-open-source--compact' : ''}`}
        title={primaryLink}
        aria-label={`Open source link for ${alert.event_title}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <ExternalLink size={compact ? 15 : 16} aria-hidden="true" />
      </a>
    )
  }

  // Shared renderer for impacted property block used in all alert cards.
  const renderImpactedProperties = (alert: DatasurfrAlert) => {
    const names = impactedPropertiesForAlert(alert)
    const totalCount = Math.max(alert.impacted_property_count || 0, names.length)
    if (!totalCount) {
      return null
    }

    const expanded = Boolean(expandedProperties[alert.id])
    const hasMore = names.length > PROPERTY_PREVIEW_LIMIT
    const visible = expanded ? names : names.slice(0, PROPERTY_PREVIEW_LIMIT)

    return (
      <div className="datasurfr-impact-block">
        <div className="datasurfr-impact-head">
          <span className="datasurfr-impact-label">
            Potentially Affected Properties: {totalCount}
          </span>
          {hasMore ? (
            <button
              type="button"
              className="datasurfr-impact-toggle"
              onClick={() => toggleExpandedProperties(alert.id)}
            >
              {expanded ? 'Show less' : `View all (${names.length})`}
            </button>
          ) : null}
        </div>
        {visible.length ? (
          <div className="datasurfr-impact-list">
            {visible.join(' | ')}
          </div>
        ) : (
          <div className="datasurfr-impact-list">
            Property count available from mapping metadata.
          </div>
        )}
      </div>
    )
  }

  const tabCountByKey: Record<FeedTabKey, number> = {
    priority: highImpactAlerts.length,
    region_priority: Object.keys(regionPreferredByAlert).length,
    all_news: alerts.length,
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
    if (!datasurfrGuideLaunchNonce) return
    setShowGuideDoneMessage(false)
    setGuideStepIndex(0)
    setIsGuideActive(true)
  }, [datasurfrGuideLaunchNonce])

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
    if (!isGuideActive || !activeGuideStep) return
    if (activeGuideStep.key === 'region-filter') {
      setActiveTab('region_priority')
      return
    }
    if (activeGuideStep.key === 'all-news-table') {
      setActiveTab('all_news')
      return
    }
    if (activeGuideStep.key === 'priority-stream') {
      setActiveTab('priority')
    }
  }, [activeGuideStep, isGuideActive])

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
          if (current >= DATASURFR_GUIDE_STEPS.length - 1) {
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
      if (current >= DATASURFR_GUIDE_STEPS.length - 1) {
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
    return ` datasurfr-guide-target${activeGuideStep.key === stepKey ? ' is-active' : ' is-dimmed'}`
  }, [activeGuideStep, isGuideActive])

  return (
    <section className={`datasurfr-page datasurfr-page--pro${isGuideActive ? ' is-guide-active' : ''}`}>
      {/* Sticky command bar: filter context + fetch + import actions stay visible while scrolling. */}
      <div id="datasurfr-guide-sticky-head" className={`datasurfr-sticky-head${guideClassFor('control-bar')}`}>
        <div className="datasurfr-head-top">
          <div className="datasurfr-head-left">
            <div className="datasurfr-head-help">
              {canUseActions
                ? 'Single items can be directly imported. Multiple items can either be saved individually or sent together in summary format.'
                : 'Review-only access: browse alerts, filters, sources, and mapped-property context.'}
            </div>
          </div>
          <div className="datasurfr-head-right">
            <div className="datasurfr-head-actions">
              <button
                className="btn-secondary datasurfr-icon-btn"
                onClick={() => exportFeedMutation.mutate()}
                disabled={exportFeedMutation.isPending}
                aria-label={exportFeedMutation.isPending ? 'Exporting feed' : 'Export feed to Excel'}
                title={exportFeedMutation.isPending ? 'Exporting feed' : 'Export feed to Excel'}
              >
                {exportFeedMutation.isPending ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
              </button>
              {canUseActions ? (
                <>
                  <button
                    className="btn-secondary btn-success-action datasurfr-icon-btn"
                    onClick={selectAllInTab}
                    disabled={!selectableCount}
                    aria-label="Select all"
                    title="Select all"
                  >
                    <CheckSquare size={14} />
                  </button>
                  <button
                    className="btn-secondary btn-danger-action datasurfr-icon-btn"
                    onClick={clearSelection}
                    disabled={!selectedCount}
                    aria-label="Clear selection"
                    title="Clear selection"
                  >
                    <SquareX size={14} />
                  </button>
                  <button
                    className="btn-secondary datasurfr-icon-btn"
                    onClick={() => saveMutation.mutate()}
                    disabled={!canSaveMultiple || actionPending}
                    aria-label={saveMutation.isPending ? 'Saving selected' : 'Save selected'}
                    title={saveMutation.isPending ? 'Saving selected' : 'Save selected'}
                  >
                    {saveMutation.isPending ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => eventsSummaryMutation.mutate()}
                    disabled={!canCreateSummary || actionPending}
                  >
                    {eventsSummaryMutation.isPending ? 'Importing Events Summary...' : 'Import Events Summary'}
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => importMutation.mutate()}
                    disabled={!canImportSingle || actionPending}
                  >
                    {importMutation.isPending ? 'Importing Event...' : 'Import Event'}
                  </button>
                </>
              ) : null}
              {selectedCount > 0 ? <span className="datasurfr-selected-count">{selectedCount} selected</span> : null}
            </div>
            <div className="datasurfr-control-strip">
          <div id="datasurfr-guide-tabs" className={`datasurfr-tabs${guideClassFor('tabs')}`}>
                {FEED_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`datasurfr-tab${activeTab === tab.key ? ' is-active' : ''}`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                    <span className="datasurfr-tab-count">{tabCountByKey[tab.key]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {message ? <InlineNotice tone="info">{message}</InlineNotice> : null}
      {error ? <InlineNotice tone="danger">{error instanceof Error ? error.message : 'Failed to load Datasurfr alerts.'}</InlineNotice> : null}

      {activeTab === 'priority' ? (
        !isLoading ? (
          <section id="datasurfr-guide-priority-stream" className={`datasurfr-stream datasurfr-stream--priority${guideClassFor('priority-stream')}`}>
            <header className="datasurfr-stream-head">
              <h3 className="datasurfr-stream-title">Priority Operational Alerts</h3>
              <div className="datasurfr-stream-head-tools">
                <select
                  aria-label="Select news category"
                  value={activeCategory}
                  className="datasurfr-category-view-select"
                  onChange={(e) =>
                    setSelectedCategoryByTab((prev) => ({
                      ...prev,
                      [activeTab]: e.target.value as AlertCategoryKey,
                    }))
                  }
                >
                  {ALERT_CATEGORY_OPTIONS.map((category) => (
                    <option key={category.key} value={category.key}>
                      {category.label} ({categoryCountByKey[category.key]})
                    </option>
                  ))}
                </select>
              </div>
            </header>
            {filteredHighImpactAlerts.length ? (
              <div className="datasurfr-priority-list">
                {filteredHighImpactAlerts.map((alert) => (
                  <article
                    key={`priority-${alert.id}`}
                    className={`datasurfr-priority-card${isSelected(alert.id) ? ' is-selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected(alert.id)}
                    onClick={(event) => handleTileActivate(event, () => toggleSelection(alert.id))}
                    onKeyDown={(event) => handleTileActivate(event, () => toggleSelection(alert.id))}
                  >
                    <div className="datasurfr-priority-select-row">
                      <div className="datasurfr-priority-select-copy">
                        <div className="datasurfr-priority-heading">{alert.event_title}</div>
                        <div className="datasurfr-priority-meta">
                          ID: {alert.id} | Impact score {alert.hotel_impact_score} | {alert.latest_update_age_minutes ?? '-'} min ago
                        </div>
                        {firstMappedRegion(alert) ? (
                          <div className="datasurfr-priority-meta">Mapped region: {uniqueStrings(alert.mapped_regions).join(', ')}</div>
                        ) : null}
                      </div>
                      {renderSourceOpenButton(alert, true)}
                    </div>
                    {alert.hotel_impact_reasons.length ? (
                      <div className="datasurfr-priority-reasons">
                        {alert.hotel_impact_reasons.join(' | ')}
                      </div>
                    ) : null}
                    {renderImpactedProperties(alert)}
                  </article>
                ))}
              </div>
            ) : (
                <div className="datasurfr-priority-empty">
                  No priority alerts match the selected category.
                </div>
              )}
          </section>
        ) : null
      ) : null}

      {activeTab === 'region_priority' ? (
        !isLoading ? (
          <div className="datasurfr-region-wrap">
            {regionPriorityGroups.length ? (
              <div id="datasurfr-guide-region-filter" className={`datasurfr-region-filter${guideClassFor('region-filter')}`}>
                <div className="datasurfr-region-picker-head">
                  <div className="datasurfr-filter-row-title">Select Region</div>
                  {selectedRegionFilter ? (
                    <button
                      type="button"
                      className="datasurfr-region-clear"
                      onClick={() => setSelectedRegionFilter('')}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                <div className="datasurfr-region-picker">
                  {regionOptions.map((region) => (
                    <button
                      key={region}
                      type="button"
                      className={`datasurfr-region-btn${selectedRegionFilter === region ? ' is-active' : ''}`}
                      onClick={() => setSelectedRegionFilter(region)}
                    >
                      {region}
                    </button>
                  ))}
                </div>
                {selectedRegionGroup ? (
                  <div className="datasurfr-region-filter-actions">
                    <span className="datasurfr-region-filter-note">
                      {selectedRegionGroup.region === UNMAPPED_REGION_LABEL
                        ? `Showing ${filteredSelectedRegionAlerts.length} high-impact alerts that need region mapping review.`
                        : `Showing ${filteredSelectedRegionAlerts.length} priority alerts in ${selectedRegionGroup.region}.`}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
            {regionPriorityGroups.length ? (
              selectedRegionGroup ? (
                <section key={selectedRegionGroup.region} className="datasurfr-stream datasurfr-stream--region">
                  <header className="datasurfr-stream-head">
                    <h3 className="datasurfr-stream-title">{selectedRegionGroup.region}</h3>
                    <div className="datasurfr-stream-head-tools">
                      <select
                        aria-label="Select news category"
                        value={activeCategory}
                        className="datasurfr-category-view-select"
                        onChange={(e) =>
                          setSelectedCategoryByTab((prev) => ({
                            ...prev,
                            [activeTab]: e.target.value as AlertCategoryKey,
                          }))
                        }
                      >
                        {ALERT_CATEGORY_OPTIONS.map((category) => (
                          <option key={category.key} value={category.key}>
                            {category.label} ({categoryCountByKey[category.key]})
                          </option>
                        ))}
                      </select>
                    </div>
                  </header>
                  {filteredSelectedRegionAlerts.length ? (
                    <div className="datasurfr-priority-list">
                      {filteredSelectedRegionAlerts.map((alert) => (
                        <article
                          key={`region-${selectedRegionGroup.region}-${alert.id}`}
                          className={`datasurfr-priority-card${isSelectedForRegion(alert.id, selectedRegionGroup.region) ? ' is-selected' : ''}`}
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSelectedForRegion(alert.id, selectedRegionGroup.region)}
                          onClick={(event) =>
                            handleTileActivate(event, () =>
                              toggleSelection(
                                alert.id,
                                selectedRegionGroup.region === UNMAPPED_REGION_LABEL ? null : selectedRegionGroup.region,
                              ),
                            )}
                          onKeyDown={(event) =>
                            handleTileActivate(event, () =>
                              toggleSelection(
                                alert.id,
                                selectedRegionGroup.region === UNMAPPED_REGION_LABEL ? null : selectedRegionGroup.region,
                              ),
                            )}
                        >
                          <div className="datasurfr-priority-select-row">
                            <div className="datasurfr-priority-select-copy">
                              <div className="datasurfr-priority-heading">{alert.event_title}</div>
                              <div className="datasurfr-priority-meta">
                                ID: {alert.id} | Impact score {alert.hotel_impact_score} | {alert.latest_update_age_minutes ?? '-'} min ago
                              </div>
                              <div className="datasurfr-priority-meta">
                                {selectedRegionGroup.region === UNMAPPED_REGION_LABEL
                                  ? 'Import scope: Event-scoped mapping (no region override)'
                                  : `Import scope: All mapped properties in ${selectedRegionGroup.region}`}
                              </div>
                            </div>
                            {renderSourceOpenButton(alert, true)}
                          </div>
                          {alert.hotel_impact_reasons.length ? (
                            <div className="datasurfr-priority-reasons">
                              {alert.hotel_impact_reasons.join(' | ')}
                            </div>
                          ) : null}
                          {renderImpactedProperties(alert)}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="datasurfr-priority-empty">
                      No region-wise priority alerts match the selected category.
                    </div>
                  )}
                </section>
              ) : (
                <div className="datasurfr-priority-empty">
                  Select a region to view its priority alerts.
                </div>
              )
            ) : (
              <div className="datasurfr-priority-empty">
                No region-wise priority alerts in this time window.
              </div>
            )}
          </div>
        ) : null
      ) : null}

      {importedItems.length > 1 ? (
        <section
          id="datasurfr-guide-imported-results"
          className={`datasurfr-stream datasurfr-stream--imported${guideClassFor('imported-results')}`}
        >
          <header className="datasurfr-stream-head">
            <h3 className="datasurfr-stream-title">Imported Alerts</h3>
            <span className="datasurfr-stream-count">{importedItems.length} drafts created</span>
          </header>
          <div className="datasurfr-imported-list">
            {importedItems.map((item) => (
              <div
                key={`${item.alert_id}-${item.notification_id}`}
                className="datasurfr-imported-item"
              >
                <div className="datasurfr-imported-copy">
                  <div className="datasurfr-imported-title">
                    {item.heading || `Notification #${item.notification_id}`}
                  </div>
                  <div className="datasurfr-imported-meta">
                    Alert ID: {item.alert_id} | Draft ID: {item.notification_id}{item.region ? ` | Region scope: ${item.region}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => navigate(`/compose?id=${item.notification_id}`)}
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {skipDetails.length > 0 ? (
        <InlineNotice tone="warning" title="Skipped Alerts">
          {skipDetails.map((item) => (
            <div key={item.alert_id} className="datasurfr-skipped-item">
              <strong>{item.alert_id}</strong>: {item.reason}
            </div>
          ))}
        </InlineNotice>
      ) : null}

      {activeTab === 'all_news' ? (
        <>
          <div className="datasurfr-stream-head datasurfr-stream-head--table">
            <h3 className="datasurfr-stream-title">All News</h3>
            <div className="datasurfr-stream-head-tools">
              <select
                aria-label="Select news category"
                value={activeCategory}
                className="datasurfr-category-view-select"
                onChange={(e) =>
                  setSelectedCategoryByTab((prev) => ({
                    ...prev,
                    [activeTab]: e.target.value as AlertCategoryKey,
                  }))
                }
              >
                {ALERT_CATEGORY_OPTIONS.map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.label} ({categoryCountByKey[category.key]})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div id="datasurfr-guide-all-news-table" className={`datasurfr-table-view${guideClassFor('all-news-table')}`}>
            <table className="datasurfr-table">
              <thead>
                <tr>
                  <th className="datasurfr-col-select"></th>
                  <th className="datasurfr-col-title">Title</th>
                  <th className="datasurfr-col-location">Location</th>
                  <th className="datasurfr-col-risk">Risk</th>
                  <th className="datasurfr-col-update">Latest Update</th>
                  <th className="datasurfr-col-sources">Sources</th>
                </tr>
              </thead>
              <tbody>
                {filteredAllAlerts.map((alert) => (
                  <tr key={alert.id} className="datasurfr-table-row">
                    <td className="datasurfr-table-cell datasurfr-table-cell-select">
                      <input type="checkbox" checked={isSelected(alert.id)} onChange={() => toggleSelection(alert.id)} />
                    </td>
                    <td className="datasurfr-table-cell datasurfr-table-cell-wrap">
                      <div className="datasurfr-table-title">{alert.event_title}</div>
                      <div className="datasurfr-table-meta datasurfr-table-meta-spaced">ID: {alert.id}</div>
                      {alert.previously_imported ? (
                        <div className="datasurfr-reimport-note datasurfr-table-meta-spaced">
                          Added before ({alert.prior_import_count} {alert.prior_import_count === 1 ? 'time' : 'times'}) - you can still import it again.
                        </div>
                      ) : null}
                      {alert.event_description ? (
                        <div className="datasurfr-table-desc datasurfr-table-desc-spaced">
                          {alert.event_description.slice(0, 260)}
                          {alert.event_description.length > 260 ? '...' : ''}
                        </div>
                      ) : null}
                      <div className="datasurfr-table-impact">
                        {renderImpactedProperties(alert)}
                      </div>
                    </td>
                    <td className="datasurfr-table-cell datasurfr-table-cell-wrap">
                      <div>{alert.event_location || '-'}</div>
                      <div className="datasurfr-table-meta datasurfr-table-meta-spaced">{alert.event_date || '-'}</div>
                      {alert.mapped_regions.length ? (
                        <div className="datasurfr-table-meta datasurfr-table-meta-spaced">
                          Regions: {uniqueStrings(alert.mapped_regions).join(', ')}
                        </div>
                      ) : null}
                    </td>
                    <td className="datasurfr-table-cell datasurfr-table-cell-wrap">
                      <div>{alert.risk_category || '-'}</div>
                      <div className="datasurfr-table-meta datasurfr-table-meta-spaced">{alert.sub_risk_category_name || '-'}</div>
                    </td>
                    <td className="datasurfr-table-cell datasurfr-table-cell-wrap">
                      <div>{alert.latest_update_local || alert.latest_update || '-'}</div>
                      {alert.latest_update_age_minutes !== null ? (
                        <div className="datasurfr-table-meta datasurfr-table-meta-spaced">
                          {alert.latest_update_age_minutes} min ago
                        </div>
                      ) : null}
                    </td>
                    <td className="datasurfr-table-cell">
                      {alert.source_links.length ? (
                        <div className="datasurfr-source-list">
                          {alert.source_links.slice(0, 3).map((link, index) => (
                            <div key={link} className="datasurfr-source-item">
                              <a
                                href={link}
                                target="_blank"
                                rel="noreferrer"
                                className="datasurfr-source-link"
                                title={link}
                              >
                                {getLinkLabel(link, index)}
                              </a>
                            </div>
                          ))}
                          {alert.source_links.length > 3 ? (
                            <span className="datasurfr-source-more">+{alert.source_links.length - 3} more</span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="datasurfr-no-links">No links</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!isLoading && filteredAllAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="datasurfr-empty-row">
                      No alerts match the selected category in this time window.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="datasurfr-card-view">
            {filteredAllAlerts.map((alert) => (
              <article
                key={alert.id}
                className={`datasurfr-alert-card${isSelected(alert.id) ? ' is-selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected(alert.id)}
                onClick={(event) => handleTileActivate(event, () => toggleSelection(alert.id))}
                onKeyDown={(event) => handleTileActivate(event, () => toggleSelection(alert.id))}
              >
                <div className="datasurfr-alert-header">
                  <div className="datasurfr-alert-copy">
                    <div className="datasurfr-alert-title">{alert.event_title}</div>
                    <div className="datasurfr-alert-meta">ID: {alert.id}</div>
                    {alert.previously_imported ? (
                      <div className="datasurfr-reimport-note datasurfr-alert-meta-spaced">
                        Added before ({alert.prior_import_count} {alert.prior_import_count === 1 ? 'time' : 'times'}) - you can still import it again.
                      </div>
                    ) : null}
                  </div>
                  {renderSourceOpenButton(alert)}
                </div>

                {alert.event_description ? (
                  <div className="datasurfr-alert-desc">
                    {alert.event_description.slice(0, 220)}
                    {alert.event_description.length > 220 ? '...' : ''}
                  </div>
                ) : null}

                <div className="datasurfr-alert-grid">
                  <div className="datasurfr-alert-block">
                    <div className="datasurfr-alert-label">Location</div>
                    <div className="datasurfr-alert-value">{alert.event_location || '-'}</div>
                    <div className="datasurfr-alert-meta datasurfr-alert-meta-spaced">{alert.event_date || '-'}</div>
                    {alert.mapped_regions.length ? (
                      <div className="datasurfr-alert-meta datasurfr-alert-meta-spaced">
                        Regions: {uniqueStrings(alert.mapped_regions).join(', ')}
                      </div>
                    ) : null}
                  </div>
                  <div className="datasurfr-alert-block">
                    <div className="datasurfr-alert-label">Risk</div>
                    <div className="datasurfr-alert-value">{alert.risk_category || '-'}</div>
                    <div className="datasurfr-alert-meta datasurfr-alert-meta-spaced">{alert.sub_risk_category_name || '-'}</div>
                  </div>
                  <div className="datasurfr-alert-block">
                    <div className="datasurfr-alert-label">Latest Update</div>
                    <div className="datasurfr-alert-value">{alert.latest_update_local || alert.latest_update || '-'}</div>
                    {alert.latest_update_age_minutes !== null ? (
                      <div className="datasurfr-alert-meta datasurfr-alert-meta-spaced">
                        {alert.latest_update_age_minutes} min ago
                      </div>
                    ) : null}
                  </div>
                </div>

                {renderImpactedProperties(alert)}

                <div className="datasurfr-alert-block">
                  <div className="datasurfr-alert-label">Sources</div>
                  {alert.source_links.length ? (
                    <div className="datasurfr-alert-links">
                      {alert.source_links.slice(0, 3).map((link, index) => (
                        <a
                          key={`${link}-${index}`}
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          title={link}
                        >
                          {getLinkLabel(link, index)}
                        </a>
                      ))}
                      {alert.source_links.length > 3 ? (
                        <span className="datasurfr-alert-meta">+{alert.source_links.length - 3} more</span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="datasurfr-no-links">No links</span>
                  )}
                </div>
              </article>
            ))}
            {!isLoading && filteredAllAlerts.length === 0 ? (
              <div className="datasurfr-empty-card">
                No alerts match the selected category in this time window.
              </div>
            ) : null}
          </div>
        </>
      ) : null}
      {isGuideActive && activeGuideStep ? (
        <div
          className="datasurfr-guide-popover"
          style={{ top: `${guidePopoverPosition.top}px`, left: `${guidePopoverPosition.left}px` }}
          role="dialog"
          aria-modal="false"
          aria-label="Datasurfr feed guide"
        >
          <div className="datasurfr-guide-progress">
            Step {guideStepIndex + 1} of {DATASURFR_GUIDE_STEPS.length}
          </div>
          <button
            type="button"
            className="datasurfr-guide-close-btn btn-danger-action"
            onClick={() => setIsGuideActive(false)}
            aria-label="Close guide"
            title="Close guide"
          >
            <X size={16} />
          </button>
          <h4>{activeGuideStep.title}</h4>
          <p>{activeGuideStep.description}</p>
          <ul className="datasurfr-guide-points">
            {activeGuideStep.points.map((point, idx) => (
              <li key={`${activeGuideStep.key}-point-${idx}`}>{point}</li>
            ))}
          </ul>
          <div className="datasurfr-guide-controls">
            <button
              type="button"
              className="datasurfr-guide-arrow datasurfr-guide-arrow--prev"
              onClick={handleGuidePrevious}
              disabled={guideStepIndex === 0}
            >
              Previous
            </button>
            <button
              type="button"
              className="datasurfr-guide-arrow datasurfr-guide-arrow--next"
              onClick={handleGuideNext}
            >
              {guideStepIndex === DATASURFR_GUIDE_STEPS.length - 1 ? 'Finish' : <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      ) : null}
      {showGuideDoneMessage ? (
        <div className="datasurfr-guide-done" role="status" aria-live="polite">
          Datasurfr guide completed.
        </div>
      ) : null}
    </section>
  )
}

