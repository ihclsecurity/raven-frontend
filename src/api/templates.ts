/**
 * Templates API
 *
 * What this file does
 * -------------------
 * This file wraps the template CRUD endpoints used by compose, preview, and
 * advisory generation flows.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the list and get methods first, then the create, update, and clone
 * helpers. That matches the way templates are selected and edited in the UI.
 *
 * When to change this file
 * ------------------------
 * Update this file when the backend template schema or template lifecycle
 * changes.
 *
 * What this file does not do
 * --------------------------
 * This file does not render templates or decide which template is preferred.
 */

import client from './client'
import type { Template, TemplateCreate, TemplateUpdate } from '../types/template'

export const templatesApi = {
  list: (activeOnly = true) => client.get<Template[]>('/templates', { params: { active_only: activeOnly } }).then((r) => r.data),
  get: (id: number) => client.get<Template>(`/templates/${id}`).then((r) => r.data),
  create: (data: TemplateCreate) => client.post<Template>('/templates', data).then((r) => r.data),
  update: (id: number, data: TemplateUpdate) => client.put<Template>(`/templates/${id}`, data).then((r) => r.data),
  deactivate: (id: number) => client.post<Template>(`/templates/${id}/deactivate`).then((r) => r.data),
  duplicate: (id: number) => client.post<Template>(`/templates/${id}/duplicate`).then((r) => r.data),
  remove: (id: number) => client.delete<void>(`/templates/${id}`).then((r) => r.data),
}

