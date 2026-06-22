/**
 * Authentication Shell and Session State
 *
 * This file owns the frontend's signed-in session state and the login gate that
 * protects the rest of the application. It is the central place where browser
 * session state is hydrated, cleared, and presented back to the user.
 *
 * It is responsible for:
 * - loading the current user from the backend session cookie
 * - handling login and logout actions
 * - clearing the session when auth expires
 * - rendering the locked login experience when the user is not authenticated
 * - allowing the public impact-map snapshot route to bypass the login wall
 * - keeping the query cache in sync with auth state so stale private data is
 *   not left behind after sign-out
 *
 * What this file does not do:
 * - it does not issue JWTs itself
 * - it does not manage route definitions
 * - it does not render application pages beyond the login gate
 * - it does not decide which backend endpoints are protected
 */
import { createContext, FormEvent, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { LockKeyhole, LogIn } from 'lucide-react'
import { authApi } from '../api/auth'
import { AUTH_EXPIRED_EVENT } from '../api/client'
import type { AuthUser } from '../types/auth'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  user: AuthUser | null
  status: AuthStatus
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ============================================================================
// Session bootstrap
// ============================================================================
// The provider hydrates the current session once on load and listens for auth
// expiry events so the app can clear state immediately when the cookie becomes
// invalid.

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  // The public impact-map snapshot must remain accessible without a login
  // challenge so email links can open directly for recipients.
  const isPublicSnapshotRoute = window.location.pathname === '/impact-map-snapshot'
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>(isPublicSnapshotRoute ? 'unauthenticated' : 'loading')

  // Clearing auth means more than removing the user object. We also clear the
  // React Query cache so stale private data does not survive a sign-out.
  const clearSession = useCallback(() => {
    setUser(null)
    setStatus('unauthenticated')
    queryClient.clear()
  }, [queryClient])

  useEffect(() => {
    if (isPublicSnapshotRoute) {
      setUser(null)
      setStatus('unauthenticated')
      return
    }

    // The session check runs only once on load. If it fails, the app falls
    // back to the locked login experience instead of leaving a half-initialized
    // private shell on screen.
    let cancelled = false
    authApi.me()
      .then((currentUser) => {
        if (cancelled) return
        setUser(currentUser)
        setStatus('authenticated')
      })
      .catch(() => {
        if (cancelled) return
        clearSession()
      })

    return () => {
      cancelled = true
    }
  }, [clearSession, isPublicSnapshotRoute])

  useEffect(() => {
    window.addEventListener(AUTH_EXPIRED_EVENT, clearSession)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, clearSession)
  }, [clearSession])

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password)
    setUser(result.user)
    setStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // Ignore network/logout endpoint failures; local session is still cleared.
    }
    clearSession()
  }, [clearSession])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      login,
      logout,
    }),
    [login, logout, status, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return value
}

// ============================================================================
// Locked application preview
// ============================================================================
// The login screen uses this static shell to keep the experience aligned with
// the product without exposing any real data before authentication.

function LockedApplicationPreview() {
  return (
    <div className="auth-preview-shell" aria-hidden="true">
      <aside className="auth-preview-sidebar">
        <div className="auth-preview-brand">
          <img src="/raven_mark.svg" alt="" />
          <span>Raven</span>
        </div>
        <div className="auth-preview-nav">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </aside>
      <main className="auth-preview-main">
        <header className="auth-preview-topbar">
          <div>
            <span />
            <strong />
          </div>
          <span />
        </header>
        <section className="auth-preview-grid">
          <div />
          <div />
          <div />
          <div />
        </section>
        <section className="auth-preview-panel" />
      </main>
    </div>
  )
}

// ============================================================================
// Login overlay
// ============================================================================
// This form handles the actual sign-in attempt while the preview shell remains
// visible behind it.

function LoginOverlay() {
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to sign in'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-login-overlay" role="dialog" aria-modal="true" aria-labelledby="auth-login-title">
      <form className="auth-login-card" onSubmit={handleSubmit}>
        <div className="auth-login-brand-row">
          <div>
            <strong>Raven</strong>
          </div>
        </div>
        <div className="auth-login-heading">
          <h1 id="auth-login-title">Sign in</h1>
        </div>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            autoFocus
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <div className="auth-login-error">{error}</div> : null}
        <button type="submit" className="auth-login-submit" disabled={submitting || status === 'loading'}>
          {submitting ? <LockKeyhole size={16} /> : <LogIn size={16} />}
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

// ============================================================================
// Route gate
// ============================================================================
// AuthGate keeps the shell locked until a session is ready, while still letting
// the public impact-map snapshot route render without a login challenge.

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  const isPublicSnapshotRoute = location.pathname === '/impact-map-snapshot'

  if (status === 'authenticated' || isPublicSnapshotRoute) {
    return <>{children}</>
  }

  return (
    <div className="auth-locked-page">
      <LockedApplicationPreview />
      <LoginOverlay />
    </div>
  )
}
