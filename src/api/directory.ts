/**
 * Module: Directory
 * Purpose: Core module responsible for Directory concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

import client from './client'
import type {
  Contact,
  ContactCreate,
  DirectoryImportResponse,
  ContactUpdate,
  GroupMembership,
  RecipientGroup,
  RecipientGroupCreate,
  RecipientGroupUpdate,
} from '../types/directory'

export const directoryApi = {
  listContacts: (role?: string, activeOnly = true) =>
    client
      .get<Contact[]>('/directory/contacts', {
        params: {
          role: role || undefined,
          active_only: activeOnly,
        },
      })
      .then((r) => r.data),

  createContact: (payload: ContactCreate) =>
    client.post<Contact>('/directory/contacts', payload).then((r) => r.data),

  updateContact: (contactId: number, payload: ContactUpdate) =>
    client.put<Contact>(`/directory/contacts/${contactId}`, payload).then((r) => r.data),

  deleteContact: (contactId: number) =>
    client.put<Contact>(`/directory/contacts/${contactId}`, { active: false }).then((r) => r.data),

  importContactsCsv: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return client.post<DirectoryImportResponse>('/directory/contacts/import-csv', formData).then((r) => r.data)
  },

  listGroups: (activeOnly = true) =>
    client
      .get<RecipientGroup[]>('/directory/groups', {
        params: { active_only: activeOnly },
      })
      .then((r) => r.data),

  createGroup: (payload: RecipientGroupCreate) =>
    client.post<RecipientGroup>('/directory/groups', payload).then((r) => r.data),

  updateGroup: (groupId: number, payload: RecipientGroupUpdate) =>
    client.put<RecipientGroup>(`/directory/groups/${groupId}`, payload).then((r) => r.data),

  deleteGroup: (groupId: number) =>
    client.put<RecipientGroup>(`/directory/groups/${groupId}`, { active: false }).then((r) => r.data),

  importGroupsCsv: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return client.post<DirectoryImportResponse>('/directory/groups/import-csv', formData).then((r) => r.data)
  },

  getGroupMembers: (groupId: number) =>
    client.get<GroupMembership>(`/directory/groups/${groupId}/members`).then((r) => r.data),

  setGroupMembers: (groupId: number, contactIds: number[]) =>
    client
      .put<GroupMembership>(`/directory/groups/${groupId}/members`, { contact_ids: contactIds })
      .then((r) => r.data),

  getDefaultApprover: () =>
    client.get<Contact | null>('/directory/default-approver').then((r) => r.data),

  setDefaultApprover: (contactId: number) =>
    client.put<Contact>('/directory/default-approver', { contact_id: contactId }).then((r) => r.data),
}

