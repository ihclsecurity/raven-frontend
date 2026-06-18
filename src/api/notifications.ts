/**
 * Notifications API
 *
 * What this file does
 * -------------------
 * This file wraps the notification lifecycle endpoints used for drafting,
 * generating, previewing, approving, and archiving advisories.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the create/get/update methods first, then the generation and approval
 * methods, and finally the list helper. That order follows the advisory
 * workflow in the product.
 *
 * When to change this file
 * ------------------------
 * Update this file when the backend adds a new notification action or changes
 * the preview and approval payloads.
 *
 * What this file does not do
 * --------------------------
 * This file does not render the advisory text or decide workflow state. It
 * only sends the network requests that support those screens.
 */

import client from './client'
import type {
  ApprovalDecisionPayload,
  ApprovalImportReplyPayload,
  ApprovalOverridePayload,
  ApprovalRequestPayload,
  MetadataExtractionResponse,
  NotificationGeneratePayload,
  Notification,
  NotificationCreate,
  NotificationFilters,
  NotificationListResponse,
} from '../types/notification'

export const notificationsApi = {
  create: (data: NotificationCreate) => client.post<Notification>('/notifications', data).then((r) => r.data),
  get: (id: number) => client.get<Notification>(`/notifications/${id}`).then((r) => r.data),
  getEmailPreview: (id: number, includeMap = false) =>
    client.get<{ html: string }>(`/notifications/${id}/email-preview`, { params: { include_map: includeMap } }).then((r) => r.data),
  getImpactMapPayload: (id: number) => client.get(`/notifications/${id}/impact-map-payload`).then((r) => r.data),
  update: (id: number, data: Partial<NotificationCreate>) => client.put<Notification>(`/notifications/${id}`, data).then((r) => r.data),
  save: (id: number, heading: string) => client.post<Notification>(`/notifications/${id}/save`, { heading }).then((r) => r.data),
  generate: (id: number, payload?: NotificationGeneratePayload) => client.post<Notification>(`/notifications/${id}/generate`, payload || {}).then((r) => r.data),
  requestApproval: (id: number, data: ApprovalRequestPayload) => client.post<Notification>(`/notifications/${id}/approval/request`, data).then((r) => r.data),
  importApprovalReply: (id: number, data: ApprovalImportReplyPayload) => client.post<Notification>(`/notifications/${id}/approval/import-reply`, data).then((r) => r.data),
  approve: (id: number, data: ApprovalDecisionPayload) => client.post<Notification>(`/notifications/${id}/approval/approve`, data).then((r) => r.data),
  reject: (id: number, data: ApprovalDecisionPayload) => client.post<Notification>(`/notifications/${id}/approval/reject`, data).then((r) => r.data),
  overrideApproval: (id: number, data: ApprovalOverridePayload) => client.post<Notification>(`/notifications/${id}/approval/override`, data).then((r) => r.data),
  archive: (id: number) => client.post<Notification>(`/notifications/${id}/archive`).then((r) => r.data),
  remove: (id: number) => client.delete<void>(`/notifications/${id}`).then((r) => r.data),
  extractMetadata: (id: number, payload?: NotificationGeneratePayload) => client.post<MetadataExtractionResponse>(`/notifications/${id}/extract-metadata`, payload || {}).then((r) => r.data),
  list: (filters: NotificationFilters = {}) => client.get<NotificationListResponse>('/notifications', { params: filters }).then((r) => r.data),
}

