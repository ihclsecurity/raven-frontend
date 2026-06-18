/**
 * Approvals API
 *
 * What this file does
 * -------------------
 * This file is the thin client wrapper for approval-related backend endpoints.
 * The methods here are intentionally small so the page components can focus on
 * workflow and rendering instead of request construction.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the endpoint names top to bottom. They map directly to the approval
 * workflow: list, inspect superadmins, create, update, preview, approve,
 * reject, and send.
 *
 * When to change this file
 * ------------------------
 * Update this module when the approval backend contract changes.
 *
 * What this file does not do
 * --------------------------
 * It does not contain business rules or validation. Those belong to the page
 * logic and backend services.
 */

import client from './client'
import type { ApprovalCreatePayload, ApprovalListResponse, ApprovalRequest, ApprovalSendResponse, ApprovalSuperadmin, ApprovalUpdatePayload } from '../types/approval'

// These calls stay deliberately direct so the approval UI can control the
// workflow without hidden client-side transformations.
export const approvalsApi = {
  list: () => client.get<ApprovalListResponse>('/approvals').then((r) => r.data),
  listSuperadmins: () => client.get<ApprovalSuperadmin[]>('/approvals/superadmins').then((r) => r.data),
  create: (payload: ApprovalCreatePayload) => client.post<ApprovalRequest>('/approvals', payload).then((r) => r.data),
  update: (id: number, payload: ApprovalUpdatePayload) => client.put<ApprovalRequest>(`/approvals/${id}`, payload).then((r) => r.data),
  getAdvisoryPreviewEmail: (id: number, payload: ApprovalUpdatePayload) =>
    client.post<{ html: string }>(`/approvals/${id}/email-preview`, payload).then((r) => r.data),
  approve: (id: number, notes?: string) =>
    client.post<ApprovalRequest>(`/approvals/${id}/approve`, { notes: notes || undefined }).then((r) => r.data),
  reject: (id: number, notes?: string) =>
    client.post<ApprovalRequest>(`/approvals/${id}/reject`, { notes: notes || undefined }).then((r) => r.data),
  send: (id: number) => client.post<ApprovalSendResponse>(`/approvals/${id}/send`).then((r) => r.data),
}
