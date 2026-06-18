/**
 * Authentication API
 *
 * What this file does
 * -------------------
 * This file wraps the backend endpoints used for login, logout, session
 * lookup, and user administration.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Start with the session methods, then read the admin user methods. The file
 * mirrors the two auth workflows the UI depends on: self-service login and
 * privileged user management.
 *
 * When to change this file
 * ------------------------
 * Update this file when the backend adds or changes an auth endpoint or when
 * the user payload shape changes.
 *
 * What this file does not do
 * --------------------------
 * This file does not store auth state or decide access rules. It only sends
 * requests to the backend auth routes.
 */

import client from './client'
import type { AuthUser, CreateUserPayload, LoginResponse, UpdateUserPayload } from '../types/auth'

export const authApi = {
  login: (email: string, password: string) =>
    client.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data),
  logout: () => client.post('/auth/logout').then((r) => r.data),
  me: () => client.get<AuthUser>('/auth/me').then((r) => r.data),
  listUsers: () => client.get<AuthUser[]>('/auth/users').then((r) => r.data),
  createUser: (payload: CreateUserPayload) => client.post<AuthUser>('/auth/users', payload).then((r) => r.data),
  updateUser: (userId: number, payload: UpdateUserPayload) =>
    client.patch<AuthUser>(`/auth/users/${userId}`, payload).then((r) => r.data),
  deleteUser: (userId: number) => client.delete(`/auth/users/${userId}`).then((r) => r.data),
}
