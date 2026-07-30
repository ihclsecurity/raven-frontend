/**
 * Frontend Route Map
 *
 * This file is the browser-side navigation plan for the application. It tells
 * React which screen should appear for each URL, which screens stay inside the
 * authenticated shell, and which screens require an additional privilege
 * check before they are allowed to render.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the public snapshot route first, then the authenticated shell branch,
 * and finally the `RequireFullAccess` wrapper. That matches the order in which
 * the browser actually resolves the screen.
 *
 * What this file is responsible for
 * ----------------------------------
 * - mapping URLs to page components
 * - loading heavier screens lazily so the initial bundle stays small
 * - keeping full-access pages behind the privilege check
 * - leaving the shell mounted around the workspace routes
 *
 * What this file does not do
 * --------------------------
 * - it does not render page bodies itself
 * - it does not fetch API data
 * - it does not contain page-specific business logic
 */
import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import DashboardPage from './pages/Dashboard'
import { useAuth } from './auth/AuthContext'
import { hasFullAccess } from './utils/authRoles'

// Heavy screens are split out so the shell can mount immediately while the
// page code loads only when the user actually navigates there.
const ComposePage = lazy(() => import('./pages/Compose'))
const SavedMessagesPage = lazy(() => import('./pages/SavedMessages'))
const TemplatesPage = lazy(() => import('./pages/Templates'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const EmailGroupsPage = lazy(() => import('./pages/EmailGroups'))
const PropertyMappingPage = lazy(() => import('./pages/PropertyMapping'))
const SentHistoryPage = lazy(() => import('./pages/SentHistory'))
const DatasurfrFeedPage = lazy(() => import('./pages/DatasurfrFeed'))
const ExternalFeedPage = lazy(() => import('./pages/ExternalFeed'))
const MapViewPage = lazy(() => import('./pages/MapView'))
const SendInsightsPage = lazy(() => import('./pages/SendInsights'))
const SendAdvisoriesPage = lazy(() => import('./pages/SendAdvisories'))
const ApprovalsPage = lazy(() => import('./pages/Approvals'))
const ImpactMapSnapshotPage = lazy(() => import('./pages/ImpactMapSnapshot'))
const NotFoundPage = lazy(() => import('./pages/index'))

// These wrappers keep the route table readable by hiding the lazy-loading and
// access-control mechanics behind small helper names.
function RouteLoadingFallback() {
  return (
    <div className="route-loading-surface" role="status" aria-live="polite">
      <span className="route-loading-pulse" aria-hidden="true" />
      <span>Loading workspace...</span>
    </div>
  )
}

function deferredPage(page: ReactNode) {
  return <Suspense fallback={<RouteLoadingFallback />}>{page}</Suspense>
}

function fullAccessPage(page: ReactNode) {
  return deferredPage(<RequireFullAccess>{page}</RequireFullAccess>)
}

function RequireFullAccess({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!hasFullAccess(user)) {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/impact-map-snapshot" element={deferredPage(<ImpactMapSnapshotPage />)} />
      <Route path="/" element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/send-advisories" element={fullAccessPage(<SendAdvisoriesPage />)} />
        <Route path="/send-insights" element={fullAccessPage(<SendInsightsPage />)} />
        <Route path="/approvals" element={fullAccessPage(<ApprovalsPage />)} />
        <Route path="/compose" element={fullAccessPage(<ComposePage />)} />
        <Route path="/saved" element={fullAccessPage(<SavedMessagesPage />)} />
        <Route path="/datasurfr" element={deferredPage(<DatasurfrFeedPage />)} />
        <Route path="/external-feed" element={deferredPage(<ExternalFeedPage />)} />
        <Route path="/map-view" element={deferredPage(<MapViewPage />)} />
        <Route path="/sent-history" element={fullAccessPage(<SentHistoryPage />)} />
        <Route path="/templates" element={fullAccessPage(<TemplatesPage />)} />
        <Route path="/email-groups" element={fullAccessPage(<EmailGroupsPage />)} />
        <Route path="/property-mapping" element={fullAccessPage(<PropertyMappingPage />)} />
        <Route path="/settings" element={deferredPage(<SettingsPage />)} />
        <Route path="/*" element={fullAccessPage(<NotFoundPage/>)} />
      </Route>
    </Routes>
  )
}
