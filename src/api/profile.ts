/**
 * Profile API
 *
 * What this file does
 * -------------------
 * This file wraps the profile endpoints used by signed-in users to view and
 * update their own account details.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the current-user methods first, then any profile update helpers. The UI
 * uses this file as the network layer for self-service profile editing.
 *
 * When to change this file
 * ------------------------
 * Update this file when the backend profile schema changes or when the profile
 * screen needs a new field.
 *
 * What this file does not do
 * --------------------------
 * This file does not manage authentication or broader admin user management.
 */

import client from './client'
import type { AnalystProfile } from '../types/profile'

export const profileApi = {
  get: () => client.get<AnalystProfile>('/profile').then((r) => r.data),
  update: (data: { display_name?: string; email?: string; timezone?: string }) =>
    client.put<AnalystProfile>('/profile', data).then((r) => r.data),
}

