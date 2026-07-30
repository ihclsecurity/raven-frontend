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
import { ClipboardEvent, createContext, FormEvent, KeyboardEvent, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { LockKeyhole, LogIn, ShieldCheck } from 'lucide-react'
import { authApi } from '../api/auth'
import type { RavenApiError } from '../api/client'
import type { AuthUser, LoginOtpRequiredResponse, LoginResponse, PasswordLoginResponse } from '../types/auth'
import { useCookies } from 'react-cookie'
import { getStoredRavenLogoPath } from '../constants/branding'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'
type LoginStepResult = 'authenticated' | 'otp_required'

interface OtpChallengeState {
  challengeId: string
  emailHint: string
  expiresAt?: string
  email: string
}

interface AuthContextValue {
  user: AuthUser | null
  status: AuthStatus
  otpChallenge: OtpChallengeState | null
  login: (email: string, password: string) => Promise<LoginStepResult>
  verifyOtp: (otp: string) => Promise<void>
  resendOtp: () => Promise<string>
  cancelOtp: () => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const AUTH_COOKIE_NAME = 'raven_auth'
const AUTH_SESSION_STORAGE_KEY = 'raven_auth_session'
const PASSWORD_LOGIN_ERROR = 'Invalid credentials or user not authorized.'
const OTP_VERIFY_ERROR = 'Invalid or expired verification code.'
const OTP_RESEND_ERROR = 'Unable to resend verification code. Please try again.'
const AUTH_SERVICE_ERROR = 'Authentication service is unavailable. Please check backend/database connectivity and try again.'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 48

interface StoredAuthSession {
  user: AuthUser
  expiresAt: number
}

function authCookieOptions() {
  return {
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: window.location.protocol === 'https:',
    sameSite: 'lax' as const,
  }
}

function isOtpRequiredResponse(result: PasswordLoginResponse): result is LoginOtpRequiredResponse {
  return 'requires_otp' in result && result.requires_otp === true
}

function readStoredSession(): StoredAuthSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredAuthSession>
    if (!parsed.user || !parsed.expiresAt || parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
      return null
    }
    return parsed as StoredAuthSession
  } catch {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
    return null
  }
}

function storeSession(user: AuthUser): void {
  if (typeof window === 'undefined') return
  const session: StoredAuthSession = {
    user,
    expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  }
  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
}

function removeStoredSession(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
}

function isRavenApiError(error: unknown): error is RavenApiError {
  return error instanceof Error && (
    'status' in error
    || 'code' in error
    || 'isTimeout' in error
  )
}

function passwordLoginErrorMessage(error: unknown): string {
  if (isRavenApiError(error)) {
    if (error.status === 401) return PASSWORD_LOGIN_ERROR
    if (error.status === 429 && error.message) return error.message
    return AUTH_SERVICE_ERROR
  }
  return AUTH_SERVICE_ERROR
}

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
  const storedSession = useMemo(() => (isPublicSnapshotRoute ? null : readStoredSession()), [isPublicSnapshotRoute])
  const [, setCookie, removeCookie] = useCookies(['raven_auth'])
  const [user, setUser] = useState<AuthUser | null>(storedSession?.user ?? null)
  const [status, setStatus] = useState<AuthStatus>(
    isPublicSnapshotRoute ? 'unauthenticated' : storedSession ? 'authenticated' : 'loading',
  )
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(storedSession?.expiresAt ?? null)
  const [otpChallenge, setOtpChallenge] = useState<OtpChallengeState | null>(null)

  // Clearing auth means more than removing the user object. We also clear the
  // React Query cache so stale private data does not survive a sign-out.
  const clearSession = useCallback(() => {
    setUser(null)
    setOtpChallenge(null)
    setSessionExpiresAt(null)
    setStatus('unauthenticated')
    removeStoredSession()
    removeCookie(AUTH_COOKIE_NAME, authCookieOptions())
    queryClient.clear()
  }, [queryClient, removeCookie])

  const pauseSessionHydration = useCallback(() => {
    setUser(null)
    setOtpChallenge(null)
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
        storeSession(currentUser)
        setSessionExpiresAt(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)
        setUser(currentUser)
        setStatus('authenticated')
      })
      .catch((error) => {
        if (cancelled) return
        if (isRavenApiError(error) && error.status === 401) {
          clearSession()
          return
        }
        const existingSession = readStoredSession()
        if (existingSession) {
          setUser(existingSession.user)
          setSessionExpiresAt(existingSession.expiresAt)
          setStatus('authenticated')
          return
        }
        pauseSessionHydration()
      })

    return () => {
      cancelled = true
    }
  }, [clearSession, isPublicSnapshotRoute, pauseSessionHydration])

  useEffect(() => {
    if (status !== 'authenticated' || !sessionExpiresAt) return
    const delayMs = sessionExpiresAt - Date.now()
    if (delayMs <= 0) {
      clearSession()
      return
    }
    const timeout = window.setTimeout(clearSession, delayMs)
    return () => window.clearTimeout(timeout)
  }, [clearSession, sessionExpiresAt, status])

  const finalizeLogin = useCallback((result: LoginResponse) => {
    const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000
    setCookie(AUTH_COOKIE_NAME, result.access_token, authCookieOptions())
    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ user: result.user, expiresAt }))
    setUser(result.user)
    setOtpChallenge(null)
    setSessionExpiresAt(expiresAt)
    setStatus('authenticated')
  }, [setCookie])

  const login = useCallback(async (email: string, password: string): Promise<LoginStepResult> => {
    let result: PasswordLoginResponse
    try {
      result = await authApi.login(email, password)
    } catch (error) {
      throw new Error(passwordLoginErrorMessage(error))
    }

    if (isOtpRequiredResponse(result)) {
      setOtpChallenge({
        challengeId: result.challenge_id,
        emailHint: result.email_hint,
        expiresAt: result.expires_at,
        email,
      })
      setUser(null)
      setStatus('unauthenticated')
      return 'otp_required'
    }

    finalizeLogin(result)
    return 'authenticated'
  }, [finalizeLogin])

  const verifyOtp = useCallback(async (otp: string) => {
    if (!otpChallenge) {
      throw new Error(OTP_VERIFY_ERROR)
    }
    try {
      const result = await authApi.verifyOtp(otpChallenge.challengeId, otp)
      finalizeLogin(result)
    } catch {
      throw new Error(OTP_VERIFY_ERROR)
    }
  }, [finalizeLogin, otpChallenge])

  const resendOtp = useCallback(async () => {
    if (!otpChallenge) {
      throw new Error(OTP_RESEND_ERROR)
    }
    try {
      const result = await authApi.resendOtp(otpChallenge.challengeId)
      return result.message
    } catch {
      throw new Error(OTP_RESEND_ERROR)
    }
  }, [otpChallenge])

  const cancelOtp = useCallback(() => {
    setOtpChallenge(null)
  }, [])

  const logout = useCallback(() => {
    clearSession()
    void authApi.logout().catch(() => {
      // Local sign-out must not depend on backend/network availability.
    })
  }, [clearSession])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      otpChallenge,
      login,
      verifyOtp,
      resendOtp,
      cancelOtp,
      logout,
    }),
    [cancelOtp, login, logout, otpChallenge, resendOtp, status, user, verifyOtp],
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
  const ravenLogoPath = getStoredRavenLogoPath()

  return (
    <div className="auth-preview-shell" aria-hidden="true">
      <aside className="auth-preview-sidebar">
        <div className="auth-preview-brand">
          <img src={ravenLogoPath} alt="" />
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

function AuthSessionLoading() {
  const ravenLogoPath = getStoredRavenLogoPath()

  return (
    <div className="auth-session-loading" role="status" aria-live="polite">
      <div className="auth-session-loading-card">
        <img className="auth-session-loading-logo" src={ravenLogoPath} alt="" aria-hidden="true" />
        <div>
          <strong>Raven</strong>
          <span>Verifying secure session...</span>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Login overlay
// ============================================================================
// This form handles the actual sign-in attempt while the preview shell remains
// visible behind it.

function LoginOverlay() {
  const { cancelOtp, login, otpChallenge, resendOtp, verifyOtp } = useAuth()
  const navigate = useNavigate()
  const ravenLogoPath = getStoredRavenLogoPath()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    if (!otpChallenge) return
    setOtp('')
    setError('')
    setNotice('')
    setResendCooldown(60)
  }, [otpChallenge])

  useEffect(() => {
    if (!otpChallenge || resendCooldown <= 0) return
    const timer = window.setTimeout(() => {
      setResendCooldown((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [otpChallenge, resendCooldown])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setNotice('')

    if (otpChallenge) {
      if (otp.length !== 6) return
      setSubmitting(true)
      try {
        await verifyOtp(otp)
        navigate('/dashboard', { replace: true })
      } catch {
        setError(OTP_VERIFY_ERROR)
      } finally {
        setSubmitting(false)
      }
      return
    }

    setSubmitting(true)
    try {
      const result = await login(email, password)
      if (result === 'authenticated') {
        navigate('/dashboard', { replace: true })
      } else {
        setPassword('')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : AUTH_SERVICE_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  const focusOtpInput = (index: number) => {
    otpInputRefs.current[index]?.focus()
  }

  const updateOtpDigits = (digits: string, startIndex = 0) => {
    const cleaned = digits.replace(/\D/g, '').slice(0, 6 - startIndex)
    if (!cleaned) return

    const nextDigits = Array.from({ length: 6 }, (_, index) => otp[index] ?? '')
    cleaned.split('').forEach((digit, offset) => {
      nextDigits[startIndex + offset] = digit
    })
    setOtp(nextDigits.join('').slice(0, 6))
    setError('')
    setNotice('')

    window.requestAnimationFrame(() => {
      focusOtpInput(Math.min(startIndex + cleaned.length, 5))
    })
  }

  const handleOtpBoxChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, '')
    if (cleaned.length > 1) {
      updateOtpDigits(cleaned, index)
      return
    }

    const nextDigits = Array.from({ length: 6 }, (_, digitIndex) => otp[digitIndex] ?? '')
    nextDigits[index] = cleaned
    setOtp(nextDigits.join('').slice(0, 6))
    setError('')
    setNotice('')

    if (cleaned && index < 5) {
      window.requestAnimationFrame(() => focusOtpInput(index + 1))
    }
  }

  const handleOtpKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !otp[index] && index > 0) {
      event.preventDefault()
      const nextDigits = Array.from({ length: 6 }, (_, digitIndex) => otp[digitIndex] ?? '')
      nextDigits[index - 1] = ''
      setOtp(nextDigits.join('').slice(0, 6))
      focusOtpInput(index - 1)
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      focusOtpInput(index - 1)
    } else if (event.key === 'ArrowRight' && index < 5) {
      event.preventDefault()
      focusOtpInput(index + 1)
    }
  }

  const handleOtpPaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text')
    if (!pasted) return
    event.preventDefault()
    updateOtpDigits(pasted, index)
  }

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resending) return
    setError('')
    setNotice('')
    setResending(true)
    try {
      const message = await resendOtp()
      setNotice(message)
      setResendCooldown(60)
    } catch {
      setError(OTP_RESEND_ERROR)
    } finally {
      setResending(false)
    }
  }

  const handleChangeEmail = () => {
    cancelOtp()
    setPassword('')
    setOtp('')
    setError('')
    setNotice('')
    setResendCooldown(0)
  }

  return (
    <div className="auth-login-overlay" role="dialog" aria-modal="true" aria-labelledby="auth-login-title">
      <form className={`auth-login-card${otpChallenge ? ' auth-login-card--otp' : ''}`} onSubmit={handleSubmit}>
        <div className="auth-login-brand-row">
          <div className="auth-login-brand-lockup">
            <img className="auth-login-logo" src={ravenLogoPath} alt="Raven" />
            <div>
              <span>IHCL Security Intelligence</span>
            </div>
          </div>
          <div className="auth-login-secure-pill">
            <ShieldCheck size={14} />
            Secure access
          </div>
        </div>
        <div className="auth-login-stepper" aria-label={otpChallenge ? 'Step 2 of 2' : 'Step 1 of 2'}>
          <span className="is-active">Credentials</span>
          <span className={otpChallenge ? 'is-active' : ''}>Verification</span>
        </div>
        <div className="auth-login-heading">
          <h1 id="auth-login-title">{otpChallenge ? 'Two-Step Verification' : 'Sign in'}</h1>
          {otpChallenge ? (
            <p>
              Enter the 6-digit verification code sent to{' '}
              <span className="auth-login-email-hint">{otpChallenge.emailHint}</span>.
            </p>
          ) : (
            <p>Access Raven’s OSINT command centre with your approved company account.</p>
          )}
        </div>
        {otpChallenge ? (
          <>
            <div className="auth-otp-field" role="group" aria-label="Verification code">
              <span>Verification code</span>
              <div className="auth-otp-box-row">
                {Array.from({ length: 6 }, (_, index) => (
                  <input
                    key={index}
                    ref={(element) => {
                      otpInputRefs.current[index] = element
                    }}
                    className="auth-otp-box"
                    type="text"
                    value={otp[index] ?? ''}
                    onChange={(event) => handleOtpBoxChange(index, event.target.value)}
                    onKeyDown={(event) => handleOtpKeyDown(index, event)}
                    onPaste={(event) => handleOtpPaste(index, event)}
                    inputMode="numeric"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    pattern="\d*"
                    maxLength={1}
                    aria-label={`Digit ${index + 1} of verification code`}
                    autoFocus={index === 0}
                  />
                ))}
              </div>
            </div>
            <p className="auth-login-note">
              For security, the code expires shortly. Keep this screen open while verifying access.
            </p>
          </>
        ) : (
          <>
            <label className="auth-login-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="name@company.com"
                autoFocus
                required
              />
            </label>
            <label className="auth-login-field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Enter your password"
                required
              />
            </label>
          </>
        )}
        {error ? <div className="auth-login-error">{error}</div> : null}
        {notice ? <div className="auth-login-success">{notice}</div> : null}
        <button
          type="submit"
          className={`auth-login-submit${submitting ? ' is-loading' : ''}`}
          disabled={submitting || (otpChallenge ? otp.length !== 6 : false)}
        >
          {submitting ? <LockKeyhole size={16} /> : <LogIn size={16} />}
          {otpChallenge ? (submitting ? 'Verifying...' : 'Verify') : submitting ? 'Signing in...' : 'Sign in'}
        </button>
        {otpChallenge ? (
          <div className="auth-login-actions">
            <button type="button" className="auth-login-link-btn" onClick={handleResendOtp} disabled={resending || resendCooldown > 0}>
              {resending ? 'Sending...' : resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
            </button>
            <button type="button" className="auth-login-link-btn" onClick={handleChangeEmail}>
              Change email
            </button>
          </div>
        ) : null}
        <div className="auth-login-footer">
          Protected access for Raven intelligence operations.
        </div>
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

  if (status === 'loading') {
    return <AuthSessionLoading />
  }

  return (
    <div className="auth-locked-page">
      <LockedApplicationPreview />
      <LoginOverlay />
    </div>
  )
}
