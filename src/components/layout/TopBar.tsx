/**
 * Top Bar
 *
 * This file renders the shared header that changes based on the active route.
 * It is the visible command strip for the signed-in app, so it needs to be
 * predictable and easy to scan.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the route label maps first, then the user display helper, and finally
 * the render logic. That order matches the way the header is assembled.
 *
 * It is responsible for:
 * - showing the current section and page title
 * - exposing page-specific controls such as refresh and save actions
 * - surfacing the signed-in user and logout action
 * - keeping date and guide affordances consistent across screens
 *
 * What this file does not do:
 * - it does not own page state itself
 * - it does not fetch the underlying data for each page
 * - it does not decide when a workflow should run
 */
import { Check, CircleHelp, Loader2, LogOut, Menu, RefreshCw, Save as SaveIcon, ShieldCheck } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import type { ComposeTopBarControls, FeedTopBarControls } from './AppShell'
import { formatAppDate } from '../../utils/dateTime'

interface TopBarProps {
  onMenuToggle: () => void
  feedControls?: FeedTopBarControls | null
  composeControls?: ComposeTopBarControls | null
  showGuideButton?: boolean
  onStartGuide?: () => void
}

// The top bar uses these route maps to keep the visible page title and
// section label aligned with the current screen.
// If a route label changes here, the shell header and guide button copy stay
// aligned without duplicating the same string in multiple page files.
const PAGE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/compose': 'Compose Advisory',
  '/send-insights': 'Send Insights',
  '/send-advisories': 'Send Advisories',
  '/approvals': 'Approvals',
  '/datasurfr': 'Datasurfr Feed',
  '/external-feed': 'External Feed',
  '/map-view': 'Map View',
  '/saved': 'Saved Messages',
  '/sent-history': 'Delivery History',
  '/templates': 'Templates',
  '/email-groups': 'Email Groups',
  '/property-mapping': 'Property Mapping',
  '/settings': 'Settings',
}

const PAGE_SECTIONS: Record<string, string> = {
  '/dashboard': 'Operations',
  '/compose': 'Operations',
  '/send-insights': 'Operations',
  '/send-advisories': 'Operations',
  '/approvals': 'Operations',
  '/saved': 'Operations',
  '/sent-history': 'Operations',
  '/datasurfr': 'Intelligence',
  '/external-feed': 'Intelligence',
  '/map-view': 'Intelligence',
  '/templates': 'Workspace',
  '/email-groups': 'Workspace',
  '/property-mapping': 'Workspace',
  '/settings': 'Workspace',
}

function userDisplayName(user: ReturnType<typeof useAuth>['user']): string {
  // Prefer the analyst's actual name, then fall back to email, then a generic label.
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
  return name || user?.email || 'Admin'
}

export function TopBar({
  onMenuToggle,
  feedControls,
  composeControls,
  showGuideButton = false,
  onStartGuide,
}: TopBarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const isDashboard = location.pathname === '/dashboard'
  const isCompose = location.pathname === '/compose'
  const today = formatAppDate(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const currentPageLabel = PAGE_LABELS[location.pathname] || 'Operations'
  const currentSectionLabel = PAGE_SECTIONS[location.pathname] || 'Operations'
  const guideLabel = `Start ${currentPageLabel} guide`
  const displayName = userDisplayName(user)
  const handleLogout = () => {
    void logout()
    navigate('/dashboard', { replace: true })
  }

  return (
    <header id="dashboard-guide-topbar" className={`app-topbar${isDashboard ? ' app-topbar--dashboard-clean' : ''}`}>
      <div className="app-topbar-left">
        <button type="button" className="app-topbar-menu-button" onClick={onMenuToggle} aria-label="Toggle navigation menu">
          <Menu size={18} />
        </button>
        <div className="app-topbar-context">
          <span className="app-topbar-context-kicker">{currentSectionLabel}</span>
          <strong>{currentPageLabel}</strong>
        </div>
      </div>
      <div className="app-topbar-right">
        {feedControls ? (
          <div className="app-topbar-dashboard-controls" aria-label="Feed controls">
            <div className="dashboard-window-picker">
              <select
                aria-label="Global feed time window"
                value={feedControls.timeWindow}
                onChange={(e) => feedControls.onTimeWindowChange(Number(e.target.value))}
              >
                {feedControls.windowOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn-secondary app-topbar-refresh-btn"
              aria-label={feedControls.refreshLabel}
              title={feedControls.refreshLabel}
              onClick={feedControls.onRefresh}
            >
              <RefreshCw size={14} />
            </button>
            <div className="dashboard-live-pill app-topbar-live-pill">
              <span className="dashboard-live-dot" />
              Live | Updated {feedControls.liveLabel}
            </div>
          </div>
        ) : null}
        {isCompose && composeControls ? (
          <div className="app-topbar-compose-controls" aria-label="Compose controls">
            <button
              type="button"
              className={`btn-secondary compose-header-save-button${composeControls.saveStatus === 'saved' ? ' is-saved' : ''}${composeControls.saveStatus === 'saving' ? ' is-saving' : ''}`}
              disabled={composeControls.saveStatus === 'saving'}
              onClick={composeControls.onSave}
              aria-label={composeControls.saveLabel}
              title={composeControls.saveLabel}
            >
              {composeControls.saveStatus === 'saving' ? (
                <Loader2 size={16} className="compose-header-save-spinner" aria-hidden="true" />
              ) : composeControls.saveStatus === 'saved' ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <SaveIcon size={16} aria-hidden="true" />
              )}
            </button>
          </div>
        ) : null}
        {showGuideButton ? (
          <button
            type="button"
            className="btn-secondary app-topbar-guide-btn"
            onClick={onStartGuide}
            aria-label={guideLabel}
            title={guideLabel}
          >
            <CircleHelp size={15} />
          </button>
        ) : null}
        <div className="app-topbar-user" title={user?.email || displayName}>
          <ShieldCheck size={14} />
          <span>{displayName}</span>
        </div>
        <button type="button" className="btn-secondary app-topbar-logout-btn" onClick={handleLogout} aria-label="Sign out" title="Sign out">
          <LogOut size={15} />
        </button>
        <div className="app-topbar-date">{today}</div>
      </div>
    </header>
  )
}
