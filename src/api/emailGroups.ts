/**
 * Email Groups API
 *
 * What this file does
 * -------------------
 * This file wraps the email-group endpoints used to manage branded recipient
 * groups and their mapped properties.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the property lookup first, then the list and mutation methods. That is
 * the same order the email group editor uses when building a group.
 *
 * When to change this file
 * ------------------------
 * Update this file when the backend changes how email-group properties are
 * listed, created, or updated.
 *
 * What this file does not do
 * --------------------------
 * This file does not evaluate property membership rules. It only calls the
 * backend endpoints.
 */

import client from './client'
import type { EmailGroup, EmailGroupInput, EmailGroupPropertyOption } from '../types/emailGroups'

export const emailGroupsApi = {
  listProperties: () =>
    client.get<EmailGroupPropertyOption[]>('/email-groups/properties').then((r) => r.data),

  list: (activeOnly = false) =>
    client.get<EmailGroup[]>('/email-groups', { params: { active_only: activeOnly } }).then((r) => r.data),

  create: (payload: EmailGroupInput) =>
    client.post<EmailGroup>('/email-groups', payload).then((r) => r.data),

  update: (groupId: number, payload: Partial<EmailGroupInput>) =>
    client.put<EmailGroup>(`/email-groups/${groupId}`, payload).then((r) => r.data),
}
