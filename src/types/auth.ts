/**
 * Authentication Contracts
 *
 * What this file does
 * -------------------
 * This file defines the frontend data shapes for login, current-user, and
 * admin user management responses.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Start with `AuthUser`, then read the login response and admin payloads. That
 * gives the full picture of how the auth screens exchange data with the API.
 *
 * When to change this file
 * ------------------------
 * Update this file when the backend auth payload changes or when user profile
 * fields are added or removed.
 *
 * What this file does not do
 * --------------------------
 * This file does not enforce authentication. It only defines the data contract
 * used by the frontend.
 */

export type AuthUserRole = 'user' | 'admin' | 'superadmin'

export interface AuthUser {
  id: number
  email: string
  role: AuthUserRole
  active: boolean
  first_name?: string | null
  last_name?: string | null
  designation?: string | null
  property_name?: string | null
  city?: string | null
  state?: string | null
  region?: string | null
  country?: string | null
  phone_number?: string | null
  whatsapp_number?: string | null
  last_login_at?: string | null
}

export interface LoginResponse {
  access_token: string
  token_type: 'bearer'
  user: AuthUser
}

export interface LoginOtpRequiredResponse {
  requires_otp: true
  challenge_id: string
  email_hint: string
  expires_at?: string
}

export type PasswordLoginResponse = LoginResponse | LoginOtpRequiredResponse

export interface OtpVerifyRequest {
  challenge_id: string
  otp: string
}

export interface OtpResendRequest {
  challenge_id: string
}

export interface OtpResendResponse {
  message: string
}

export interface CreateUserPayload {
  email: string
  password: string
  role?: AuthUserRole
  active?: boolean
  first_name?: string | null
  last_name?: string | null
  designation?: string | null
  property_name?: string | null
  city?: string | null
  state?: string | null
  region?: string | null
  country?: string | null
  phone_number?: string | null
  whatsapp_number?: string | null
}

export interface UpdateUserPayload {
  password?: string
  role?: AuthUserRole
  active?: boolean
  first_name?: string | null
  last_name?: string | null
  designation?: string | null
  property_name?: string | null
  city?: string | null
  state?: string | null
  region?: string | null
  country?: string | null
  phone_number?: string | null
  whatsapp_number?: string | null
}
