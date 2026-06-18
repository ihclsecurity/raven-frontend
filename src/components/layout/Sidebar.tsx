/**
 * Sidebar Navigation
 *
 * This file renders the persistent left navigation rail for the app shell.
 * It is the product's main route map once a user is signed in, so the layout
 * and access rules here need to stay easy to read.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Start with the route groups, then the access filter, and finally the render
 * block. That mirrors the way the sidebar decides what to show.
 *
 * It is responsible for:
 * - grouping routes into Operations, Intelligence, and Workspace sections
 * - hiding workspace-only routes from lower-privilege users
 * - showing the current theme toggle and logo state
 * - surfacing LLM connection status from settings so operators can see it at a glance
 *
 * What this file does not do:
 * - it does not route the app by itself
 * - it does not fetch page data beyond the lightweight status checks it shows
 * - it does not own the page content behind each link
 */
import { Building2, CheckSquare, Files, Globe, LayoutDashboard, LayoutTemplate, Mail, Map, Moon, PencilLine, Plug, Send, Settings, Sun, Users, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router-dom'
import { settingsApi } from '../../api/settings'
import { getRavenLogoPath } from '../../constants/branding'
import { useAuth } from '../../auth/AuthContext'
import { hasFullAccess } from '../../utils/authRoles'

// The navigation groups are declared once so the shell and active-route logic
// stay in sync with the product's main operational areas.
// Keeping the routes in one array avoids accidental drift between the sidebar
// labels, icons, and the route guard logic that hides workspace-only pages.
const navGroups = [
  {
    title: 'Operations',
    links: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/send-advisories', label: 'Send Advisories', icon: Send, requiresFullAccess: true },
      { to: '/send-insights', label: 'Send Insights', icon: Send, requiresFullAccess: true },
      { to: '/approvals', label: 'Approvals', icon: CheckSquare, requiresFullAccess: true },
      { to: '/compose', label: 'Compose', icon: PencilLine, requiresFullAccess: true },
      { to: '/saved', label: 'Saved Messages', icon: Files, requiresFullAccess: true },
      { to: '/sent-history', label: 'Delivery History', icon: Mail, requiresFullAccess: true },
    ],
  },
  {
    title: 'Intelligence',
    links: [
      { to: '/datasurfr', label: 'Datasurfr Feed', icon: Plug },
      { to: '/external-feed', label: 'External Feed', icon: Globe },
      { to: '/map-view', label: 'Map View', icon: Map },
    ],
  },
  {
    title: 'Workspace',
    links: [
      { to: '/email-groups', label: 'Email Groups', icon: Users, requiresFullAccess: true },
      { to: '/templates', label: 'Templates', icon: LayoutTemplate, requiresFullAccess: true },
      { to: '/property-mapping', label: 'Property Mapping', icon: Building2, requiresFullAccess: true },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

interface SidebarProps {
  mobileOpen: boolean
  onClose: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function Sidebar({ mobileOpen, onClose, theme, onToggleTheme }: SidebarProps) {
  const { user } = useAuth()
  const isDark = theme === 'dark'
  const canUseWorkspace = hasFullAccess(user)
  const logoPath = getRavenLogoPath(theme)
  const { data: llmConnection, isLoading: llmConnectionLoading } = useQuery({
    queryKey: ['sidebar-llm-connection'],
    queryFn: () => settingsApi.testLlmConnection({}),
    enabled: canUseWorkspace,
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
  const llmStatusText = llmConnectionLoading
    ? 'LLM checking...'
    : llmConnection?.ok
      ? `LLM connected (${llmConnection.model || llmConnection.provider || 'Unknown'})`
      : 'LLM disconnected'
  const llmStatusClass = llmConnectionLoading
    ? 'is-loading'
    : llmConnection?.ok
      ? 'is-connected'
      : 'is-disconnected'

  return (
    <>
      <button
        type="button"
        className={`app-sidebar-backdrop${mobileOpen ? ' is-visible' : ''}`}
        onClick={onClose}
        aria-label="Close navigation menu"
      />
      <aside className={`app-sidebar raven-dark-scroll${mobileOpen ? ' is-open' : ''}`}>
        <div className="app-sidebar-brand">
          <img
            src={logoPath}
            alt="Raven"
            className="app-sidebar-logo"
          />
          <button type="button" className="app-sidebar-close" onClick={onClose} aria-label="Close navigation menu">
            <X size={16} />
          </button>
        </div>

        <nav className="app-sidebar-nav">
          {navGroups.map((group) => {
            const visibleLinks = group.links.filter((link) => !link.requiresFullAccess || canUseWorkspace)
            if (!visibleLinks.length) return null
            return (
              <section key={group.title} className="app-sidebar-group" aria-label={group.title}>
                <div className="app-sidebar-group-title">{group.title}</div>
                <div className="app-sidebar-group-links">
                  {visibleLinks.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={({ isActive }) => `app-sidebar-link${isActive ? ' is-active' : ''}`}
                    onClick={onClose}
                  >
                    <link.icon size={16} className="app-sidebar-link-icon" />
                    {link.label}
                  </NavLink>
                  ))}
                </div>
              </section>
            )
          })}

          <section className="app-sidebar-group" aria-label="Appearance">
            <div className="app-sidebar-group-title">Appearance</div>
            <button
              type="button"
              className="app-sidebar-theme-toggle"
              onClick={onToggleTheme}
              aria-pressed={isDark}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              <span className="app-sidebar-theme-toggle-track" aria-hidden="true">
                <span className="app-sidebar-theme-toggle-thumb">
                  {isDark ? <Moon size={14} className="app-sidebar-theme-toggle-icon" /> : <Sun size={14} className="app-sidebar-theme-toggle-icon" />}
                </span>
              </span>
              <span className="app-sidebar-theme-toggle-copy">
                <span className="app-sidebar-theme-toggle-label">Theme</span>
                <span className="app-sidebar-theme-toggle-value">{isDark ? 'Dark mode' : 'Light mode'}</span>
              </span>
            </button>
          </section>
        </nav>

        {canUseWorkspace ? (
          <div className={`app-sidebar-llm-status ${llmStatusClass}`}>
            <span>{llmStatusText}</span>
          </div>
        ) : null}

        <div className="app-sidebar-footer">
          Phase 1 - Local build
        </div>
      </aside>
    </>
  )
}
