/**
 * Application Shell
 *
 * This file defines the shared frame that wraps almost every authenticated
 * page in the frontend. It is where the app decides how the sidebar, top bar,
 * loading overlay, and route-specific controls fit together.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the storage helpers first, then the background advisory generation
 * workflow, and only then the React component. That order matches the way the
 * shell accumulates state before it renders anything visible.
 *
 * What this file is responsible for
 * ----------------------------------
 * - persisting the user-selected theme and feed window
 * - mounting the sidebar and top bar around routed content
 * - keeping route-specific top bar controls in one place
 * - coordinating feed refreshes and background advisory generation
 * - exposing helper state that page components can register with the shell
 *
 * What this file does not do
 * --------------------------
 * - it does not render the individual page bodies
 * - it does not own API schemas or backend logic
 * - it does not decide the content of the routed pages
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { datasurfrApi } from '../../api/datasurfr'
import { notificationsApi } from '../../api/notifications'
import { templatesApi } from '../../api/templates'
import type { Notification } from '../../types/notification'
import { DEFAULT_FEED_WINDOW_MINUTES, FEED_WINDOW_VALUES } from '../../constants/feedWindows'
import { PREFERRED_ADVISORY_TEMPLATE_NAME, findPreferredAdvisoryTemplate } from '../../utils/advisoryTemplates'
import { apiTime } from '../../utils/dateTime'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

type ThemeMode = 'light' | 'dark'

// ============================================================================
// Shell persistence and route coordination
// ============================================================================
// The shell keeps theme and feed-window preferences stable between page loads,
// and it centralizes the state that route-specific top-bar controls register.

const THEME_STORAGE_KEY = 'raven-theme-mode'
const FEED_WINDOW_STORAGE_KEY = 'raven-feed-time-window'

export interface FeedTopBarControls {
  timeWindow: number
  windowOptions: Array<{ label: string; value: number }>
  onTimeWindowChange: (value: number) => void
  onRefresh: () => void
  liveLabel: string
  refreshLabel: string
}

export interface ComposeTopBarControls {
  saveStatus: 'save' | 'saving' | 'saved'
  saveLabel: string
  onSave: () => void
}

export interface AdvisoryBackgroundGenerationState {
  isRunning: boolean
  generatedCount: number
  totalCount: number
  failedCount: number
  skippedCount: number
  lastMessage: string | null
  windowMinutes: number | null
}

type AdvisoryGenerationMode = 'missing' | 'all'

// The shell deduplicates background generation using the notification's
// external event id, because a single alert can be imported more than once
// over time and we only want to regenerate the latest matching notification.
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

async function listAllNotificationsForAdvisoryDedupe(): Promise<Notification[]> {
  const pageSize = 100
  let page = 1
  let total = Number.POSITIVE_INFINITY
  const collected: Notification[] = []

  // Notifications are paginated, so the shell walks every page before it tries
  // to detect duplicates. That keeps the background generation logic honest
  // even when the advisory list is larger than a single API response.
  while ((page - 1) * pageSize < total) {
    const response = await notificationsApi.list({ page, page_size: pageSize })
    collected.push(...(response.items || []))
    total = Number(response.total || 0)
    page += 1
    if (!(response.items || []).length) break
  }

  return collected
}

// Theme and feed window defaults are read from browser storage first so the
// shell preserves the last operator preference across sessions.
function detectPreferredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'

  const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') {
    return saved
  }

  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }

  return 'light'
}

function detectPreferredFeedWindow(): number {
  if (typeof window === 'undefined') return DEFAULT_FEED_WINDOW_MINUTES
  const saved = Number(window.localStorage.getItem(FEED_WINDOW_STORAGE_KEY) || '')
  return FEED_WINDOW_VALUES.has(saved) ? saved : DEFAULT_FEED_WINDOW_MINUTES
}

// ============================================================================
// Shell runtime
// ============================================================================
// The shell owns the shared layout state, guide launch bookkeeping, and the
// background advisory regeneration workflow that spans multiple pages.
export function AppShell() {
  const location = useLocation()
  const queryClient = useQueryClient()
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>(() => detectPreferredTheme())
  const [feedTopBarControls, setFeedTopBarControls] = useState<FeedTopBarControls | null>(null)
  const [composeTopBarControls, setComposeTopBarControls] = useState<ComposeTopBarControls | null>(null)
  const [sharedFeedTimeWindow, setSharedFeedTimeWindow] = useState<number>(() => detectPreferredFeedWindow())
  const [feedRefreshNonce, setFeedRefreshNonce] = useState(0)
  const [dashboardGuideLaunchNonce, setDashboardGuideLaunchNonce] = useState(0)
  const [composeGuideLaunchNonce, setComposeGuideLaunchNonce] = useState(0)
  const [sendInsightsGuideLaunchNonce, setSendInsightsGuideLaunchNonce] = useState(0)
  const [savedMessagesGuideLaunchNonce, setSavedMessagesGuideLaunchNonce] = useState(0)
  const [sentHistoryGuideLaunchNonce, setSentHistoryGuideLaunchNonce] = useState(0)
  const [datasurfrGuideLaunchNonce, setDatasurfrGuideLaunchNonce] = useState(0)
  const [externalFeedGuideLaunchNonce, setExternalFeedGuideLaunchNonce] = useState(0)
  const [mapViewGuideLaunchNonce, setMapViewGuideLaunchNonce] = useState(0)
  const [backgroundGeneratedAdvisories, setBackgroundGeneratedAdvisories] = useState<Notification[]>([])
  const [advisoryGenerationState, setAdvisoryGenerationState] = useState<AdvisoryBackgroundGenerationState>({
    isRunning: false,
    generatedCount: 0,
    totalCount: 0,
    failedCount: 0,
    skippedCount: 0,
    lastMessage: null,
    windowMinutes: null,
  })
  const advisoryGenerationStartedRef = useRef(false)
  const triggerFeedRefresh = useCallback(() => {
    setFeedRefreshNonce((current) => current + 1)
  }, [])

  const runBackgroundAdvisoryGeneration = useCallback(async (mode: AdvisoryGenerationMode = 'missing') => {
    if (advisoryGenerationStartedRef.current) return
    advisoryGenerationStartedRef.current = true
    setAdvisoryGenerationState({
      isRunning: true,
      generatedCount: 0,
      totalCount: 0,
      failedCount: 0,
      skippedCount: 0,
      lastMessage: 'Starting advisory generation in background...',
      windowMinutes: sharedFeedTimeWindow,
    })

    try {
      const [templates, alerts] = await Promise.all([
        templatesApi.list(true),
        datasurfrApi.listAlerts(sharedFeedTimeWindow),
      ])
      const advisoryTemplate = findPreferredAdvisoryTemplate(templates)
      if (!advisoryTemplate) {
        setAdvisoryGenerationState((current) => ({
          ...current,
          isRunning: false,
          lastMessage: `Template "${PREFERRED_ADVISORY_TEMPLATE_NAME}" is not available or active.`,
        }))
        return
      }

      // Only high-impact alerts should enter the advisory workflow. Lower
      // severity events remain visible in intelligence views but are not
      // automatically promoted into emailed advisories.
      const priorityAlerts = alerts.filter((alert) => alert.hotel_impact_level === 'high')
      if (!priorityAlerts.length) {
        setAdvisoryGenerationState((current) => ({
          ...current,
          isRunning: false,
          lastMessage: `No priority alerts found for ${mode === 'all' ? 'regeneration' : 'background generation'}.`,
        }))
        return
      }

      const existingNotifications = await listAllNotificationsForAdvisoryDedupe()
      const existingByEventId = new Map<string, Notification>()
      for (const item of existingNotifications) {
        const eventId = getDatasurfrExternalEventId(item)
        if (!eventId) {
          continue
        }
        const existing = existingByEventId.get(eventId)
        if (!existing) {
          existingByEventId.set(eventId, item)
          continue
        }
        const existingTs = apiTime(existing.updated_at || existing.created_at)
        const candidateTs = apiTime(item.updated_at || item.created_at)
        if (candidateTs > existingTs) {
          existingByEventId.set(eventId, item)
        }
      }

      const missingAlerts = priorityAlerts.filter((alert) => !existingByEventId.has(String(alert.id)))
      if (mode === 'missing' && !missingAlerts.length) {
        setAdvisoryGenerationState((current) => ({
          ...current,
          isRunning: false,
          totalCount: 0,
          skippedCount: 0,
          failedCount: 0,
          generatedCount: 0,
          lastMessage: `All advisories for ${sharedFeedTimeWindow} mins are already available.`,
        }))
        return
      }

      // Missing advisories are imported first so the generation step can work
      // on the newly created notification records instead of raw alerts.
      let importedItems: Array<{ notification_id: number }> = []
      let skippedCount = 0
      if (missingAlerts.length) {
        const result = await datasurfrApi.importAlerts({
          selections: missingAlerts.map((alert) => ({ alert_id: alert.id })),
          time: sharedFeedTimeWindow,
          template_id: advisoryTemplate.id,
        })
        importedItems = result.imported.map((item) => ({ notification_id: item.notification_id }))
        skippedCount = result.skipped.length
      }

      // The regeneration flow can target both existing notifications and newly
      // imported ones, so the shell merges both sources before generation.
      const targetNotificationIds: number[] = []
      if (mode === 'all') {
        for (const alert of priorityAlerts) {
          const existing = existingByEventId.get(String(alert.id))
          if (existing?.id) {
            targetNotificationIds.push(existing.id)
          }
        }
      }
      for (const item of importedItems) {
        targetNotificationIds.push(item.notification_id)
      }

      const dedupedTargetNotificationIds = Array.from(new Set(targetNotificationIds))
      const totalCount = dedupedTargetNotificationIds.length
      let generatedCount = 0
      let failedCount = 0
      setAdvisoryGenerationState((current) => ({
        ...current,
        totalCount,
        skippedCount,
        lastMessage: totalCount
          ? mode === 'all'
            ? 'Generating advisories again for the selected time window...'
            : 'Generating advisories in background...'
          : 'No advisories to generate.',
      }))

      if (!totalCount) {
        setAdvisoryGenerationState((current) => ({
          ...current,
          isRunning: false,
          generatedCount: 0,
          failedCount: 0,
          lastMessage: mode === 'all'
            ? `No advisories available to generate again for ${sharedFeedTimeWindow} mins.`
            : 'No advisories to generate.',
        }))
        return
      }

      for (const notificationId of dedupedTargetNotificationIds) {
        try {
          const generated = await notificationsApi.generate(notificationId, { template_id: advisoryTemplate.id })
          generatedCount += 1
          setBackgroundGeneratedAdvisories((prev) => {
            const merged = [generated, ...prev]
            const seen = new Set<number>()
            return merged.filter((entry) => {
              if (seen.has(entry.id)) return false
              seen.add(entry.id)
              return true
            })
          })
        } catch {
          failedCount += 1
          try {
            const draft = await notificationsApi.get(notificationId)
            setBackgroundGeneratedAdvisories((prev) => {
              const merged = [draft, ...prev]
              const seen = new Set<number>()
              return merged.filter((entry) => {
                if (seen.has(entry.id)) return false
                seen.add(entry.id)
                return true
              })
            })
          } catch {
            // Keep batch resilient.
          }
        }
        setAdvisoryGenerationState((current) => ({
          ...current,
          generatedCount,
          failedCount,
          lastMessage: mode === 'all'
            ? `Generated again ${generatedCount}/${totalCount} advisories...`
            : `Generated ${generatedCount}/${totalCount} advisories...`,
        }))
      }

      await queryClient.invalidateQueries({ queryKey: ['send-advisories-notifications'] })
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
      setAdvisoryGenerationState((current) => ({
        ...current,
        isRunning: false,
        generatedCount,
        failedCount,
        lastMessage: mode === 'all'
          ? `Generate again complete. Regenerated ${generatedCount} advisories.${skippedCount ? ` Skipped ${skippedCount}.` : ''}${failedCount ? ` ${failedCount} failed to generate text.` : ''}`
          : `Background generation complete. Generated ${generatedCount} advisories.${skippedCount ? ` Skipped ${skippedCount}.` : ''}${failedCount ? ` ${failedCount} failed to generate text.` : ''}`,
      }))
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : mode === 'all'
          ? 'Failed to generate advisories again.'
          : 'Failed to generate advisories in background.'
      setAdvisoryGenerationState((current) => ({
        ...current,
        isRunning: false,
        lastMessage: message,
      }))
    } finally {
      advisoryGenerationStartedRef.current = false
    }
  }, [queryClient, sharedFeedTimeWindow])
  const regenerateAllAdvisories = useCallback(async () => {
    await runBackgroundAdvisoryGeneration('all')
  }, [runBackgroundAdvisoryGeneration])
  // This loading gate only appears while the intelligence-heavy routes are
  // waiting on their first fetch, so the dashboard does not flash an overlay
  // during unrelated navigation.
  const intelligenceInitialLoadCount = useIsFetching({
    predicate: (query) => {
      const route = location.pathname
      if (!['/dashboard', '/map-view', '/datasurfr'].includes(route)) return false
      const key0 = String(query.queryKey?.[0] ?? '')
      if (route === '/dashboard') {
        return (
          ['datasurfr-alerts', 'dashboard-delivered-today', 'dashboard-failed-today'].includes(key0)
          && query.state.status === 'pending'
        )
      }
      if (route === '/map-view') {
        return (
          ['datasurfr-alerts', 'map-view-properties'].includes(key0)
          && query.state.status === 'pending'
        )
      }
      return key0 === 'datasurfr-alerts' && query.state.status === 'pending'
    },
  })
  const isIntelligenceInitialLoad = intelligenceInitialLoadCount > 0

  useEffect(() => {
    setIsMobileNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }
    document.body.classList.toggle('mobile-nav-open', isMobileNavOpen)
    return () => document.body.classList.remove('mobile-nav-open')
  }, [isMobileNavOpen])

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.style.colorScheme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(FEED_WINDOW_STORAGE_KEY, String(sharedFeedTimeWindow))
  }, [sharedFeedTimeWindow])

  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: ['datasurfr-alerts', sharedFeedTimeWindow, feedRefreshNonce],
      queryFn: () => datasurfrApi.listAlerts(sharedFeedTimeWindow),
      staleTime: 60000,
    })
    void queryClient.prefetchQuery({
      queryKey: ['map-view-properties', feedRefreshNonce],
      queryFn: () => datasurfrApi.listMapProperties(),
      staleTime: 300000,
    })
  }, [feedRefreshNonce, queryClient, sharedFeedTimeWindow])

  useEffect(() => {
    if (location.pathname !== '/dashboard' && location.pathname !== '/map-view' && location.pathname !== '/send-advisories' && location.pathname !== '/datasurfr') {
      setFeedTopBarControls(null)
    }
    if (location.pathname !== '/compose') {
      setComposeTopBarControls(null)
    }
  }, [location.pathname])

  useEffect(() => {
    void runBackgroundAdvisoryGeneration()
  }, [runBackgroundAdvisoryGeneration])

  return (
    <div className="app-shell">
      <Sidebar
        mobileOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
      />
      <div className="app-shell-main">
        <TopBar
          onMenuToggle={() => setIsMobileNavOpen((open) => !open)}
          feedControls={location.pathname === '/dashboard' || location.pathname === '/map-view' || location.pathname === '/send-advisories' || location.pathname === '/datasurfr' ? feedTopBarControls : null}
          composeControls={location.pathname === '/compose' ? composeTopBarControls : null}
          showGuideButton={
            location.pathname === '/dashboard'
            || location.pathname === '/compose'
            || location.pathname === '/send-insights'
            || location.pathname === '/saved'
            || location.pathname === '/sent-history'
            || location.pathname === '/datasurfr'
            || location.pathname === '/external-feed'
            || location.pathname === '/map-view'
          }
          onStartGuide={() => {
            if (location.pathname === '/dashboard') {
              setDashboardGuideLaunchNonce((current) => current + 1)
            } else if (location.pathname === '/compose') {
              setComposeGuideLaunchNonce((current) => current + 1)
            } else if (location.pathname === '/send-insights') {
              setSendInsightsGuideLaunchNonce((current) => current + 1)
            } else if (location.pathname === '/saved') {
              setSavedMessagesGuideLaunchNonce((current) => current + 1)
            } else if (location.pathname === '/sent-history') {
              setSentHistoryGuideLaunchNonce((current) => current + 1)
            } else if (location.pathname === '/datasurfr') {
              setDatasurfrGuideLaunchNonce((current) => current + 1)
            } else if (location.pathname === '/external-feed') {
              setExternalFeedGuideLaunchNonce((current) => current + 1)
            } else if (location.pathname === '/map-view') {
              setMapViewGuideLaunchNonce((current) => current + 1)
            }
          }}
        />
        <main className="app-shell-content raven-dark-scroll">
          {isIntelligenceInitialLoad ? (
            <div className="app-page-loading-overlay" role="status" aria-live="polite">
              <div className="app-page-loading-card">
                <Loader2 size={18} className="app-page-loading-spinner" />
                <span>Loading latest feed data...</span>
              </div>
            </div>
          ) : null}
          <Outlet
            context={{
              setFeedTopBarControls,
              setComposeTopBarControls,
              sharedFeedTimeWindow,
              setSharedFeedTimeWindow,
              feedRefreshNonce,
              triggerFeedRefresh,
              dashboardGuideLaunchNonce,
              composeGuideLaunchNonce,
              sendInsightsGuideLaunchNonce,
              savedMessagesGuideLaunchNonce,
              sentHistoryGuideLaunchNonce,
              datasurfrGuideLaunchNonce,
              externalFeedGuideLaunchNonce,
              mapViewGuideLaunchNonce,
              backgroundGeneratedAdvisories,
              advisoryGenerationState,
              runBackgroundAdvisoryGeneration,
              regenerateAllAdvisories,
            }}
          />
        </main>
      </div>
    </div>
  )
}
