/**
 * Module: Dashboard
 * Purpose: Core module responsible for Dashboard concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, BellRing, ChevronLeft, ChevronRight, ExternalLink, Mail, Plus, Send, ShieldAlert, X } from 'lucide-react'
import { datasurfrApi } from '../api/datasurfr'
import { deliveryApi } from '../api/delivery'
import { FEED_WINDOW_OPTIONS } from '../constants/feedWindows'
import { ALERT_CATEGORY_ORDER, categorizeAlert, createAlertCategoryCounts, type FilterableAlertCategoryKey } from '../constants/taxonomy'
import type { FeedTopBarControls } from '../components/layout/AppShell'
import { DashboardKpiCard } from '../components/common/DashboardKpiCard'
import { MetricInfoHint } from '../components/common/MetricInfoHint'
import { DashboardMapWindow } from '../components/dashboard/DashboardMapWindow'
import { RegionalStackedBarCard } from '../components/dashboard/RegionalStackedBarCard'
import { RiskCategoryTreemap } from '../components/dashboard/RiskCategoryTreemap'
import { AccuWeatherWindow } from '../components/dashboard/AccuWeatherWindow'
import { useAuth } from '../auth/AuthContext'
import { hasFullAccess } from '../utils/authRoles'
import { formatAppTime } from '../utils/dateTime'

const DELIVERED_RANGE_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: '24h', label: 'Last 24 hours' },
  { key: '4d', label: 'Last 4 days' },
  { key: '1w', label: '1 week' },
  { key: '1m', label: '1 month' },
] as const

type DeliveredRangeKey = typeof DELIVERED_RANGE_OPTIONS[number]['key']

const LEVEL_COLORS: Record<string, string> = {
  high: '#dc2626',
  medium: '#f59e0b',
  low: '#2563eb',
}

const DELIVERY_CATEGORY_COLORS = ['#2563eb', '#0f766e', '#d97706', '#7c3aed', '#be123c', '#475569']

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

function propertyKey(value: string): string {
  return String(value || '').trim().toLowerCase()
}

function firstSourceLink(alert: { source_links?: string[] | null }): string | null {
  const link = alert.source_links?.find((item) => String(item || '').trim())
  return link ? String(link).trim() : null
}

function localDateKey(date = new Date()): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function localDateTimeKey(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`
}

function formatCount(value: number | undefined): string {
  if (!value || !Number.isFinite(value)) return '0'
  return value.toLocaleString('en-IN')
}

function userWeatherLocation(user: ReturnType<typeof useAuth>['user']): string {
  return [user?.city, user?.state, user?.country].filter(Boolean).join(', ')
}

function categoryColor(index: number): string {
  return DELIVERY_CATEGORY_COLORS[index % DELIVERY_CATEGORY_COLORS.length]
}

function mockSparkline(seed: number, tone: 'priority' | 'info' | 'success' | 'failed'): number[] {
  // TODO: Replace with real historical window-series once backend exposes per-window KPI trend points.
  if (tone === 'priority') return [seed + 1, seed + 2, seed + 1, seed + 3, seed + 2, seed]
  if (tone === 'success') return [seed - 2, seed - 1, seed, seed + 1, seed + 2, seed + 2]
  if (tone === 'failed') return [Math.max(0, seed - 1), seed, seed, Math.max(0, seed - 1), seed, seed]
  return [seed - 1, seed, seed + 1, seed, seed + 1, seed]
}

type DashboardGuideStep = {
  key: string
  targetId: string
  title: string
  description: string
  points?: string[]
}

const DASHBOARD_GUIDE_STEPS: DashboardGuideStep[] = [
  {
    key: 'top-nav',
    targetId: 'dashboard-guide-topbar',
    title: 'Dashboard',
    description: 'The page gives a comprehensive view of the news alerts received and their potential impact on IHCL properties.',
    points: [
      'Users can select a particular time window that will apply to the platform.',
    ],
  },
  {
    key: 'kpi',
    targetId: 'dashboard-guide-kpi',
    title: 'KPI Cards',
    description: 'The Key Performance Indicators cards showcase the following metrics:',
    points: [
      'Priority Alerts: Events that have potential security or business impact on IHCL properties, including terror activities, natural disasters, or gas/water shortages.',
      'All Alerts Received: Total number of alerts received from DataSurfr in the selected time window, whether or not they impact IHCL properties.',
      'Delivered Today: Advisories generated and delivered to IHCL staff over email on the current date.',
      'Failed Deliveries: Advisories generated but failed to send over email on the current date.',
    ],
  },
  {
    key: 'map',
    targetId: 'dashboard-guide-map',
    title: 'Map',
    description: 'The map showcases a dynamic view of events with potential impact in the selected time period window.',
    points: [
      'Users can view events and all IHCL properties on the map. Each event also has a highlighted potential impact region.',
      'Users can filter the map to show or hide properties, impact radius, impacted properties for a selected event, and region-wise data.',
      'Users can import an event directly from the map to generate advisories.',
    ],
  },
  {
    key: 'risk-category-mix',
    targetId: 'dashboard-guide-risk-mix',
    title: 'Risk Category Mix',
    description: 'This dynamic treemap showcases the count of various categories of priority events in the selected time window.',
    points: [
      'The size of each block changes based on the number of events recorded for that category.',
    ],
  },
  {
    key: 'severity-distribution',
    targetId: 'dashboard-guide-severity',
    title: 'Severity Distribution',
    description: 'All alerts received from DataSurfr are divided into three severity levels: High, Medium, and Low.',
    points: [
      'Only high-severity events are considered priority events that may have potential impact on IHCL properties.',
    ],
  },
  {
    key: 'regional-alert-stack',
    targetId: 'dashboard-guide-regional-stack',
    title: 'Regional Alert Stack',
    description: 'This window divides all alerts received into various IHCL regions.',
    points: [
      'Within each region, alerts are further divided into categories according to their nature.',
      'Events in areas where IHCL does not currently hold a property are also shown.',
    ],
  },
  {
    key: 'top-critical-alerts',
    targetId: 'dashboard-guide-top-critical',
    title: 'Top Critical Alerts',
    description: 'This window shows the top priority alerts received within the selected time window.',
    points: [
      'Users can import a selected event directly from here to generate an advisory.',
    ],
  },
  {
    key: 'weather',
    targetId: 'dashboard-guide-weather',
    title: 'Weather',
    description: 'Use this window to view the weather forecast for any location.',
    points: [
      'It also displays weather-related advisories for that location.',
    ],
  },
]

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canUseActions = hasFullAccess(user)
  const defaultWeatherLocation = userWeatherLocation(user)
  const guideDoneTimeoutRef = useRef<number | null>(null)
  const [selectedRiskCategory, setSelectedRiskCategory] = useState<FilterableAlertCategoryKey | null>(null)
  const [selectedHeatmapCell, setSelectedHeatmapCell] = useState<{
    region: string
    category: FilterableAlertCategoryKey
  } | null>(null)
  const {
    setFeedTopBarControls,
    sharedFeedTimeWindow,
    setSharedFeedTimeWindow,
    feedRefreshNonce,
    triggerFeedRefresh,
    dashboardGuideLaunchNonce,
  } = useOutletContext<{
    setFeedTopBarControls: (controls: FeedTopBarControls | null) => void
    sharedFeedTimeWindow: number
    setSharedFeedTimeWindow: (value: number) => void
    feedRefreshNonce: number
    triggerFeedRefresh: () => void
    dashboardGuideLaunchNonce: number
  }>()
  const [isGuideActive, setIsGuideActive] = useState(false)
  const [isDeliveredModalOpen, setIsDeliveredModalOpen] = useState(false)
  const [deliveredModalView, setDeliveredModalView] = useState<'category' | 'region' | 'list'>('category')
  const [deliveredRange, setDeliveredRange] = useState<DeliveredRangeKey>('today')
  const [propertyListDetail, setPropertyListDetail] = useState<{
    title: string
    properties: string[]
  } | null>(null)
  const [guideStepIndex, setGuideStepIndex] = useState(0)
  const [guidePopoverPosition, setGuidePopoverPosition] = useState({ top: 84, left: 20 })
  const [showGuideDoneMessage, setShowGuideDoneMessage] = useState(false)
  const today = useMemo(() => localDateKey(), [])
  const deliveredRangeFilters = useMemo(() => {
    const now = new Date()
    if (deliveredRange === 'today') {
      return { date_from: today, date_to: today }
    }
    const start = new Date(now)
    if (deliveredRange === '24h') start.setHours(start.getHours() - 24)
    if (deliveredRange === '4d') start.setDate(start.getDate() - 4)
    if (deliveredRange === '1w') start.setDate(start.getDate() - 7)
    if (deliveredRange === '1m') start.setMonth(start.getMonth() - 1)
    return { date_from: localDateTimeKey(start), date_to: localDateTimeKey(now) }
  }, [deliveredRange, today])
  const deliveredRangeLabel = DELIVERED_RANGE_OPTIONS.find((option) => option.key === deliveredRange)?.label || 'Today'
  const activeGuideStep = isGuideActive ? DASHBOARD_GUIDE_STEPS[guideStepIndex] : null

  const alertsQuery = useQuery({
    queryKey: ['datasurfr-alerts', sharedFeedTimeWindow, feedRefreshNonce],
    queryFn: () => datasurfrApi.listAlerts(sharedFeedTimeWindow),
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    staleTime: 60000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

  const deliveredTodayQuery = useQuery({
    queryKey: ['dashboard-delivered-today', today, feedRefreshNonce],
    queryFn: () => deliveryApi.listAll({ channel: 'email', status: 'delivered', date_from: today, page_size: 1 }),
    refetchInterval: 30000,
    staleTime: 60000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

  const failedTodayQuery = useQuery({
    queryKey: ['dashboard-failed-today', today, feedRefreshNonce],
    queryFn: () => deliveryApi.listAll({ channel: 'email', status: 'failed', date_from: today, page_size: 1 }),
    refetchInterval: 30000,
    staleTime: 60000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

  const deliveredSummaryQuery = useQuery({
    queryKey: ['dashboard-delivered-summary', deliveredRange, deliveredRangeFilters.date_from, deliveredRangeFilters.date_to, feedRefreshNonce],
    queryFn: () => deliveryApi.summary({
      channel: 'email',
      status: 'delivered',
      date_from: deliveredRangeFilters.date_from,
      date_to: deliveredRangeFilters.date_to,
    }),
    enabled: isDeliveredModalOpen,
    staleTime: 30000,
  })

  const alerts = alertsQuery.data || []

  const highPriorityAlerts = useMemo(
    () => alerts.filter((alert) => alert.hotel_impact_level === 'high'),
    [alerts],
  )
  const heatmapFilteredAlerts = useMemo(() => {
    if (!selectedHeatmapCell) return alerts
    return alerts.filter((alert) => {
      if (categorizeAlert(alert) !== selectedHeatmapCell.category) return false
      const mappedRegions = uniqueStrings(alert.mapped_regions || [])
      const regions = mappedRegions.length ? mappedRegions : ['Needs Mapping']
      return regions.some((region) => region.toLowerCase() === selectedHeatmapCell.region.toLowerCase())
    })
  }, [alerts, selectedHeatmapCell])
  const filteredAlertsForMap = useMemo(
    () =>
      selectedRiskCategory
        ? heatmapFilteredAlerts.filter((alert) => categorizeAlert(alert) === selectedRiskCategory)
        : heatmapFilteredAlerts,
    [heatmapFilteredAlerts, selectedRiskCategory],
  )
  const filteredHighPriorityAlerts = useMemo(
    () =>
      selectedRiskCategory
        ? heatmapFilteredAlerts
            .filter((alert) => alert.hotel_impact_level === 'high')
            .filter((alert) => categorizeAlert(alert) === selectedRiskCategory)
        : heatmapFilteredAlerts.filter((alert) => alert.hotel_impact_level === 'high'),
    [heatmapFilteredAlerts, selectedRiskCategory],
  )

  const categoryCounts = useMemo(() => {
    return createAlertCategoryCounts(highPriorityAlerts)
  }, [highPriorityAlerts])

  const levelCounts = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0 }
    for (const alert of alerts) {
      const key = alert.hotel_impact_level || 'low'
      if (key === 'high' || key === 'medium' || key === 'low') {
        counts[key] += 1
      }
    }
    return counts
  }, [alerts])

  const severityDonutStyle = useMemo(() => {
    const total = levelCounts.high + levelCounts.medium + levelCounts.low
    if (!total) {
      return { background: '#e2e8f0' }
    }
    const highPct = (levelCounts.high / total) * 100
    const medPct = (levelCounts.medium / total) * 100
    const lowPct = Math.max(0, 100 - highPct - medPct)
    return {
      background: `conic-gradient(
        ${LEVEL_COLORS.high} 0% ${highPct}%,
        ${LEVEL_COLORS.medium} ${highPct}% ${highPct + medPct}%,
        ${LEVEL_COLORS.low} ${highPct + medPct}% ${highPct + medPct + lowPct}%
      )`,
    }
  }, [levelCounts])

  const regionStats = useMemo(() => {
    const map = new Map<string, { count: number; priority: number; sumImpact: number }>()
    for (const alert of alerts) {
      const mappedRegions = uniqueStrings(alert.mapped_regions || [])
      const regions = mappedRegions.length ? mappedRegions : ['Needs Mapping']
      for (const region of regions) {
        const current = map.get(region) || { count: 0, priority: 0, sumImpact: 0 }
        current.count += 1
        if (alert.hotel_impact_level === 'high') current.priority += 1
        current.sumImpact += alert.hotel_impact_score || 0
        map.set(region, current)
      }
    }
    return Array.from(map.entries())
      .map(([region, stat]) => ({
        region,
        ...stat,
      }))
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority
        return b.count - a.count
      })
  }, [alerts])

  const mappedRegionStats = useMemo(
    () => regionStats.filter((region) => region.region !== 'Needs Mapping'),
    [regionStats],
  )
  const topCriticalAlerts = useMemo(
    () =>
      [...filteredHighPriorityAlerts]
        .sort((a, b) => {
          if (b.hotel_impact_score !== a.hotel_impact_score) {
            return b.hotel_impact_score - a.hotel_impact_score
          }
          const aAge = a.latest_update_age_minutes ?? Number.MAX_SAFE_INTEGER
          const bAge = b.latest_update_age_minutes ?? Number.MAX_SAFE_INTEGER
          return aAge - bAge
        })
        .slice(0, 6),
    [filteredHighPriorityAlerts],
  )
  const nowLabel = formatAppTime(alertsQuery.dataUpdatedAt || Date.now())
  const isLoading = alertsQuery.isLoading || deliveredTodayQuery.isLoading || failedTodayQuery.isLoading
  const hasError = alertsQuery.error || deliveredTodayQuery.error || failedTodayQuery.error
  const priorityCount = highPriorityAlerts.length
  const allAlertsCount = alerts.length
  const deliveredCount = deliveredTodayQuery.data?.total || 0
  const failedCount = failedTodayQuery.data?.total || 0
  const impactedPriorityProperties = useMemo(() => {
    const uniqueProperties = new Set<string>()
    for (const alert of highPriorityAlerts) {
      const names = uniqueStrings([
        ...(alert.impacted_properties_all || []),
        ...(alert.impacted_properties_preview || []),
      ])
      for (const name of names) {
        const key = propertyKey(name)
        if (key) uniqueProperties.add(key)
      }
    }
    if (uniqueProperties.size > 0) {
      return uniqueProperties.size
    }
    // Fallback when property names are unavailable: avoid cross-alert double counting.
    return highPriorityAlerts.reduce(
      (max, alert) => Math.max(max, Math.max(0, alert.impacted_property_count || 0)),
      0,
    )
  }, [highPriorityAlerts])
  const mappedRegionCount = mappedRegionStats.length
  const prioritySparkline = mockSparkline(priorityCount || 1, 'priority')
  const allSparkline = mockSparkline(allAlertsCount || 1, 'info')
  const deliveredSparkline = mockSparkline(deliveredCount || 1, 'success')
  const failedSparkline = mockSparkline(failedCount || 0, 'failed')
  const deliveredSummary = deliveredSummaryQuery.data
  const deliveredCategories = deliveredSummary?.categories || []
  const deliveredRegions = deliveredSummary?.regions || []
  const deliveredAdvisories = deliveredSummary?.advisories || []
  const deliveredEmailCount = deliveredSummary?.total_email_count ?? deliveredCount
  const deliveredAdvisoriesEmailCount = deliveredSummary?.advisories_email_count || 0
  const deliveredBusinessInsightsEmailCount = deliveredSummary?.business_insights_email_count || 0
  const deliveredDailyNewsSummaryEmailCount = deliveredSummary?.daily_news_summary_email_count || 0
  const deliveredBreakdownRows = deliveredModalView === 'region' ? deliveredRegions : deliveredCategories
  const hasDeliveredBreakdownRows = deliveredBreakdownRows.length > 0
  const priorityTone = priorityCount >= 12 ? 'priority-hot' : 'priority'
  const failedTone = failedCount > 0 ? 'failed-hot' : 'failed-calm'
  const deliveredInsight =
    deliveredCount === 0
      ? 'No advisories sent yet today'
      : failedCount === 0
        ? 'Email delivery healthy'
        : `${formatCount(failedCount)} delivery issue${failedCount === 1 ? '' : 's'} open`
  const failedInsight =
    failedCount === 0
      ? 'email channel working'
      : `${formatCount(failedCount)} pending retry${failedCount === 1 ? '' : 's'}`
  const kpiCards = [
    {
      key: 'priority',
      label: 'Priority Alerts',
      value: isLoading ? '...' : formatCount(priorityCount),
      subtitle: 'High-impact signals in current window',
      insight:
        impactedPriorityProperties > 0
          ? `${formatCount(impactedPriorityProperties)} properties under impact radius`
          : 'No properties under impact radius',
      sparkline: prioritySparkline,
      icon: ShieldAlert,
      tone: priorityTone,
    },
    {
      key: 'all',
      label: 'All Alerts Received',
      value: isLoading ? '...' : formatCount(allAlertsCount),
      subtitle: 'Total incoming feed volume',
      insight:
        mappedRegionCount > 0
          ? `Across ${formatCount(mappedRegionCount)} regions`
          : 'No mapped regions yet',
      sparkline: allSparkline,
      icon: BellRing,
      tone: 'info',
    },
    {
      key: 'delivered',
      label: 'Delivered Today',
      value: formatCount(deliveredCount),
      subtitle: 'Outbound communication success',
      insight: deliveredInsight,
      sparkline: deliveredSparkline,
      icon: Send,
      tone: 'success',
    },
    {
      key: 'failed',
      label: 'Failed Deliveries',
      value: formatCount(failedCount),
      subtitle: failedCount > 0 ? 'Requires operational follow-up' : 'No active delivery issues',
      insight: failedInsight,
      sparkline: failedSparkline,
      icon: AlertTriangle,
      tone: failedTone,
    },
  ] as const
  const [priorityImportError, setPriorityImportError] = useState<string | null>(null)
  const [importingPriorityAlertId, setImportingPriorityAlertId] = useState<string | null>(null)
  const importPriorityAlertMutation = useMutation({
    mutationFn: (alertId: string) =>
      datasurfrApi.importAlerts({ alert_ids: [alertId], time: sharedFeedTimeWindow }),
    onMutate: (alertId) => {
      setPriorityImportError(null)
      setImportingPriorityAlertId(alertId)
    },
    onSuccess: (result, alertId) => {
      const imported = result.imported?.[0]
      if (imported?.notification_id) {
        navigate(`/compose?id=${imported.notification_id}`)
        return
      }
      const skippedReason =
        result.skipped?.find((entry) => entry.alert_id === alertId)?.reason ||
        result.skipped?.[0]?.reason ||
        'Import skipped.'
      setPriorityImportError(skippedReason)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to import event.'
      setPriorityImportError(message)
    },
    onSettled: () => {
      setImportingPriorityAlertId(null)
    },
  })

  const handleRefresh = useCallback(() => {
    triggerFeedRefresh()
  }, [triggerFeedRefresh])

  useEffect(() => {
    setFeedTopBarControls({
      timeWindow: sharedFeedTimeWindow,
      windowOptions: [...FEED_WINDOW_OPTIONS],
      onTimeWindowChange: setSharedFeedTimeWindow,
      onRefresh: handleRefresh,
      liveLabel: nowLabel,
      refreshLabel: 'Refresh dashboard',
    })
    return () => setFeedTopBarControls(null)
  }, [
    handleRefresh,
    nowLabel,
    setFeedTopBarControls,
    setSharedFeedTimeWindow,
    sharedFeedTimeWindow,
  ])

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
    if (!dashboardGuideLaunchNonce) return
    setShowGuideDoneMessage(false)
    setGuideStepIndex(0)
    setIsGuideActive(true)
  }, [dashboardGuideLaunchNonce])

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
      const cardHeight = 260
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
          if (current >= DASHBOARD_GUIDE_STEPS.length - 1) {
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
  }, [finishGuide, isGuideActive])

  useEffect(() => {
    if (!isDeliveredModalOpen) return

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (propertyListDetail) {
          setPropertyListDetail(null)
          return
        }
        setIsDeliveredModalOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [isDeliveredModalOpen, propertyListDetail])

  const handleGuideNext = useCallback(() => {
    setGuideStepIndex((current) => {
      if (current >= DASHBOARD_GUIDE_STEPS.length - 1) {
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
    return ` dashboard-guide-target${activeGuideStep.key === stepKey ? ' is-active' : ' is-dimmed'}`
  }, [activeGuideStep, isGuideActive])

  return (
    <section className={`dashboard-page${isGuideActive ? ' is-guide-active' : ''}`}>
      {hasError ? (
        <div className="dashboard-error">
          Unable to load one or more live feeds. Please refresh.
        </div>
      ) : null}
      {priorityImportError ? (
        <div className="dashboard-error">
          {priorityImportError}
        </div>
      ) : null}

      {canUseActions ? (
        <div id="dashboard-guide-kpi" className={`dashboard-kpi-strip${guideClassFor('kpi')}`}>
          {kpiCards.map((card) => {
            return (
              <DashboardKpiCard
                key={card.key}
                icon={card.icon}
                label={card.label}
                value={card.value}
                subtitle={card.subtitle}
                insightLabel={card.insight}
                sparkline={card.sparkline}
                tone={card.tone}
                onClick={card.key === 'delivered' ? () => {
                  setDeliveredModalView('category')
                  setIsDeliveredModalOpen(true)
                } : undefined}
                actionLabel={card.key === 'delivered' ? 'Open delivered email breakdown' : undefined}
              />
            )
          })}
        </div>
      ) : null}

      <div className="dashboard-map-risk-layout">
        <div id="dashboard-guide-map" className={guideClassFor('map')}>
          <DashboardMapWindow
            alerts={filteredAlertsForMap}
            isLoading={alertsQuery.isLoading}
            timeWindow={sharedFeedTimeWindow}
          />
        </div>
        <div className="dashboard-map-side-stack">
          <article className="dashboard-panel dashboard-panel--teal dashboard-map-side-combined">
            <section
              id="dashboard-guide-risk-mix"
              className={`dashboard-map-side-section dashboard-map-side-section--risk${guideClassFor('risk-category-mix')}`}
            >
              <div className="dashboard-panel-head">
                <h3>Risk Category Mix</h3>
                <MetricInfoHint text="Shows how total alerts are distributed across risk categories in the selected time window. Larger tiles represent higher alert volume. Use this to quickly identify dominant threat themes; click any category tile to filter both the map and the alert feed to that risk type." />
                <span>{highPriorityAlerts.length} alerts</span>
              </div>
              <RiskCategoryTreemap
                items={ALERT_CATEGORY_ORDER.map((category) => ({
                  key: category.key,
                  label: category.label,
                  color: category.color,
                  count: categoryCounts[category.key],
                }))}
                selectedCategory={selectedRiskCategory}
                onSelectCategory={setSelectedRiskCategory}
              />
            </section>

            <div className="dashboard-map-side-separator" aria-hidden="true" />

            <section
              id="dashboard-guide-severity"
              className={`dashboard-map-side-section dashboard-map-side-section--severity${guideClassFor('severity-distribution')}`}
            >
              <div className="dashboard-panel-head">
                <h3>Severity Distribution</h3>
                <MetricInfoHint text="Breaks total alerts into operational severity bands: High, Medium, and Low. This helps teams assess risk intensity at a glance and decide whether to prioritize immediate response, active monitoring, or routine watch in the current cycle." />
                <span>Event Severity Level</span>
              </div>
              <div className="dashboard-donut-wrap dashboard-panel-body-centered">
                <div className="dashboard-donut" style={severityDonutStyle}>
                  <div className="dashboard-donut-core">
                    <strong>{alerts.length}</strong>
                    <span>Total</span>
                  </div>
                </div>
                <div className="dashboard-legend">
                  {(['high', 'medium', 'low'] as const).map((level) => (
                    <div key={level} className="dashboard-legend-item">
                      <span
                        className="dashboard-legend-dot"
                        style={{ background: LEVEL_COLORS[level] }}
                      />
                      <span className="dashboard-legend-label">{level.toUpperCase()}</span>
                      <strong>{levelCounts[level]}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </article>
        </div>
      </div>

      <div className="dashboard-two-col">
        <div className="dashboard-two-col-left-stack">
          <div id="dashboard-guide-regional-stack" className={guideClassFor('regional-alert-stack')}>
            <RegionalStackedBarCard
              alerts={alerts}
              selectedCell={selectedHeatmapCell}
              onSelectCell={setSelectedHeatmapCell}
              onOpenFeed={() => navigate('/datasurfr')}
            />
          </div>
          <div id="dashboard-guide-weather" className={guideClassFor('weather')}>
            <AccuWeatherWindow defaultLocation={defaultWeatherLocation} />
          </div>
        </div>
        <article id="dashboard-guide-top-critical" className={`dashboard-panel dashboard-panel--rose${guideClassFor('top-critical-alerts')}`}>
          <div className="dashboard-panel-head">
            <h3>Top Critical Alerts</h3>
            <button type="button" className="btn-ghost" onClick={() => navigate('/datasurfr')}>
              Review
            </button>
          </div>
          <div className="dashboard-alert-list">
            {topCriticalAlerts.map((alert) => {
              const isImporting = importingPriorityAlertId === alert.id
              return (
                <div key={alert.id} className="dashboard-alert-item">
                  <div className="dashboard-alert-head">
                    <div className="dashboard-alert-title">{alert.event_title}</div>
                    <div className="dashboard-alert-head-actions">
                      {firstSourceLink(alert) ? (
                        <a
                          href={firstSourceLink(alert)!}
                          target="_blank"
                          rel="noreferrer"
                          className="dashboard-alert-source-btn"
                          title={firstSourceLink(alert)!}
                          aria-label={`Open source link for ${alert.event_title}`}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <ExternalLink size={12} aria-hidden="true" />
                        </a>
                      ) : null}
                      {canUseActions ? (
                        <button
                          type="button"
                          className="dashboard-alert-import-btn"
                          onClick={() => importPriorityAlertMutation.mutate(alert.id)}
                          disabled={isImporting}
                          title="Import to generate advisory"
                          aria-label="Import to generate advisory"
                        >
                          <Plus size={13} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="dashboard-alert-meta">
                    ID {alert.id} | Score {alert.hotel_impact_score} | {alert.latest_update_age_minutes ?? '-'} min ago
                  </div>
                  <div className="dashboard-alert-tags">
                    <span>{alert.hotel_impact_level || 'low'} impact</span>
                    <span>{alert.risk_category || 'Uncategorized'}</span>
                    <span>{alert.sub_risk_category_name || 'Other'}</span>
                  </div>
                </div>
              )
            })}
            {!topCriticalAlerts.length ? <div className="dashboard-empty">No high-impact alerts in this window.</div> : null}
          </div>
        </article>
      </div>

      {isGuideActive && activeGuideStep ? (
        <div
          className="dashboard-guide-popover"
          style={{ top: `${guidePopoverPosition.top}px`, left: `${guidePopoverPosition.left}px` }}
          role="dialog"
          aria-live="polite"
          aria-label="Dashboard guide"
        >
          <div className="dashboard-guide-progress">
            Step {guideStepIndex + 1} of {DASHBOARD_GUIDE_STEPS.length}
          </div>
          <button
            type="button"
            className="dashboard-guide-close-btn btn-danger-action"
            onClick={() => setIsGuideActive(false)}
            aria-label="Close guide"
            title="Close guide"
          >
            <X size={14} />
          </button>
          <h4>{activeGuideStep.title}</h4>
          <p>{activeGuideStep.description}</p>
          {activeGuideStep.points?.length ? (
            <ul className="dashboard-guide-points">
              {activeGuideStep.points.map((point, idx) => (
                <li key={`${activeGuideStep.key}-point-${idx}`}>{point}</li>
              ))}
            </ul>
          ) : null}
          <div className="dashboard-guide-controls">
            <button
              type="button"
              className="dashboard-guide-arrow dashboard-guide-arrow--prev"
              onClick={handleGuidePrevious}
              disabled={guideStepIndex === 0}
              aria-label="Previous step"
              title="Previous"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              className="dashboard-guide-arrow dashboard-guide-arrow--next"
              onClick={handleGuideNext}
              aria-label={guideStepIndex === DASHBOARD_GUIDE_STEPS.length - 1 ? 'Finish guide' : 'Next step'}
              title={guideStepIndex === DASHBOARD_GUIDE_STEPS.length - 1 ? 'Finish' : 'Next'}
            >
              {guideStepIndex === DASHBOARD_GUIDE_STEPS.length - 1 ? 'Finish' : <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      ) : null}

      {showGuideDoneMessage ? (
        <div className="dashboard-guide-done" role="status" aria-live="polite">
          Dashboard guide completed.
        </div>
      ) : null}

      {isDeliveredModalOpen ? (
        <div
          className="dashboard-delivery-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsDeliveredModalOpen(false)
          }}
        >
          <section
            className="dashboard-delivery-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-delivery-modal-title"
          >
            <div className="dashboard-delivery-modal-head">
              <div>
                <div className="dashboard-delivery-modal-kicker">Email delivery | {deliveredRangeLabel}</div>
                <h3 id="dashboard-delivery-modal-title">Delivered Email Breakdown</h3>
              </div>
              <button
                type="button"
                className="dashboard-delivery-modal-close btn-danger-action"
                onClick={() => setIsDeliveredModalOpen(false)}
                aria-label="Close delivered email breakdown"
              >
                <X size={16} />
              </button>
            </div>

            <div className="dashboard-delivery-modal-controls">
              <div className="dashboard-delivery-modal-tabs" role="tablist" aria-label="Delivered email breakdown views">
                <button
                  type="button"
                  className={deliveredModalView === 'category' ? 'is-active' : ''}
                  onClick={() => setDeliveredModalView('category')}
                >
                  News categories
                </button>
                <button
                  type="button"
                  className={deliveredModalView === 'region' ? 'is-active' : ''}
                  onClick={() => setDeliveredModalView('region')}
                >
                  Regions
                </button>
                <button
                  type="button"
                  className={deliveredModalView === 'list' ? 'is-active' : ''}
                  onClick={() => setDeliveredModalView('list')}
                >
                  Complete list
                </button>
              </div>
              <label className="dashboard-delivery-range-select">
                <span>Time window</span>
                <select
                  value={deliveredRange}
                  onChange={(event) => setDeliveredRange(event.target.value as DeliveredRangeKey)}
                >
                  {DELIVERED_RANGE_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={`dashboard-delivery-modal-grid${deliveredModalView === 'list' ? ' dashboard-delivery-modal-grid--list' : ''}`}>
              {deliveredModalView !== 'list' ? (
                <div className="dashboard-delivery-total-card">
                  <div className="dashboard-delivery-total-icon">
                    <Mail size={18} />
                  </div>
                  <span>Total emails sent</span>
                  <strong>{deliveredSummaryQuery.isLoading ? '...' : formatCount(deliveredEmailCount)}</strong>
                  <small>
                    Advisories: {formatCount(deliveredAdvisoriesEmailCount)} | Daily Business Digest: {formatCount(deliveredBusinessInsightsEmailCount)} | Daily News Summary: {formatCount(deliveredDailyNewsSummaryEmailCount)}
                  </small>
                </div>
              ) : null}

              {deliveredModalView === 'list' ? (
                <div className="dashboard-delivery-list-card">
                  <div className="dashboard-delivery-list-summary">
                    <strong>{formatCount(deliveredAdvisories.length)} advisories</strong>
                    <span>{formatCount(deliveredEmailCount)} emails sent | {deliveredRangeLabel}</span>
                  </div>
                  <div className="dashboard-delivery-list-scroll">
                    <table className="dashboard-delivery-table">
                      <thead>
                        <tr>
                          <th>Advisory sent</th>
                          <th>Type of incident</th>
                          <th>Affected properties</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deliveredAdvisories.map((item) => (
                          <tr key={item.notification_id}>
                            <td>
                              <strong>{item.advisory_sent}</strong>
                              <span>{formatCount(item.email_count)} email{item.email_count === 1 ? '' : 's'}</span>
                            </td>
                            <td>{item.incident_type}</td>
                            <td>
                              {item.affected_properties.length ? (
                                <div className="dashboard-delivery-property-list">
                                  {item.affected_properties.slice(0, 4).map((property) => (
                                    <span key={`${item.notification_id}-${property}`}>{property}</span>
                                  ))}
                                  {item.affected_properties.length > 4 ? (
                                    <button
                                      type="button"
                                      className="dashboard-delivery-property-more"
                                      onClick={() => setPropertyListDetail({
                                        title: item.advisory_sent,
                                        properties: item.affected_properties,
                                      })}
                                    >
                                      View all {item.affected_properties.length}
                                    </button>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="dashboard-delivery-table-muted">Not mapped</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!deliveredAdvisories.length ? (
                      <div className="dashboard-delivery-empty">No delivered advisories found for today.</div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="dashboard-delivery-chart-card">
                  {hasDeliveredBreakdownRows ? (
                    deliveredModalView === 'region' ? (
                      <div className="dashboard-delivery-region-stack" aria-label="Delivered emails by region">
                        {deliveredRegions.map((item, index) => {
                          const maxCount = Math.max(...deliveredRegions.map((entry) => entry.email_count), 1)
                          const width = `${Math.max(8, (item.email_count / maxCount) * 100)}%`
                          return (
                            <div key={item.region} className="dashboard-delivery-region-row">
                              <div className="dashboard-delivery-region-name" title={item.region}>{item.region}</div>
                              <div className="dashboard-delivery-region-track">
                                <div
                                  className="dashboard-delivery-region-fill"
                                  style={{ width, background: categoryColor(index) }}
                                />
                              </div>
                              <strong>{formatCount(item.email_count)}</strong>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="dashboard-delivery-treemap" aria-label="Delivered emails by news category">
                        {deliveredCategories.map((item, index) => {
                          const total = Math.max(1, deliveredCategories.reduce((sum, entry) => sum + entry.email_count, 0))
                          const share = (item.email_count / total) * 100
                          const flexGrow = Math.max(12, item.email_count)
                          return (
                            <div
                              key={item.category}
                              className="dashboard-delivery-tile"
                              style={{
                                flexGrow,
                                flexBasis: `${Math.max(22, share)}%`,
                                background: `linear-gradient(145deg, ${categoryColor(index)} 0%, ${categoryColor(index)}cc 100%)`,
                              }}
                            >
                              <span>{item.category}</span>
                              <strong>{formatCount(item.email_count)}</strong>
                              <small>{share.toFixed(1)}%</small>
                            </div>
                          )
                        })}
                      </div>
                    )
                  ) : (
                    <div className="dashboard-delivery-empty">No delivered emails found for {deliveredRangeLabel.toLowerCase()}.</div>
                  )}
                </div>
              )}
            </div>

            {propertyListDetail ? (
              <div
                className="dashboard-delivery-properties-backdrop"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setPropertyListDetail(null)
                }}
              >
                <section className="dashboard-delivery-properties-dialog" role="dialog" aria-modal="true" aria-label="Affected properties">
                  <div className="dashboard-delivery-properties-head">
                    <div>
                      <span>Affected properties</span>
                      <strong>{propertyListDetail.title}</strong>
                    </div>
                    <button type="button" className="btn-danger-action" onClick={() => setPropertyListDetail(null)} aria-label="Close affected properties">
                      <X size={15} />
                    </button>
                  </div>
                  <div className="dashboard-delivery-properties-grid">
                    {propertyListDetail.properties.map((property) => (
                      <span key={property}>{property}</span>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}

          </section>
        </div>
      ) : null}
    </section>
  )
}

