/**
 * Approval Contracts
 *
 * What this file does
 * -------------------
 * This file defines the shared TypeScript contracts for the approval workflow.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the request payloads first, then the approval response objects. The
 * order mirrors the approval flow in the UI and the API.
 *
 * When to change this file
 * ------------------------
 * Update this file when the backend approval schema changes or when a screen
 * needs a new approval field.
 *
 * What this file does not do
 * --------------------------
 * This file does not contain validation logic or workflow rules. It only
 * defines the data shape shared with the backend.
 */

import type { AuthUser } from './auth'

export type ApprovalItemType = 'advisory' | 'insight'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'sent'

export interface ApprovalRequest {
  id: number
  notification_id: number
  item_type: ApprovalItemType
  title: string
  subject: string | null
  message_text: string | null
  html_body: string | null
  recipient_emails: string[]
  recipient_group_ids: number[]
  recipient_group_names: string[]
  requester_user_id: number
  requester_email: string | null
  approver_user_id: number
  approver_email: string | null
  status: ApprovalStatus
  requester_notes: string | null
  decision_notes: string | null
  decided_at: string | null
  sent_at: string | null
  created_at: string | null
  updated_at: string | null
}

export interface ApprovalCreatePayload {
  notification_id: number
  item_type: ApprovalItemType
  approver_user_id: number
  title?: string
  subject?: string
  message_text?: string
  html_body?: string
  recipient_emails?: string[]
  recipient_group_ids?: number[]
  requester_notes?: string
}

export interface ApprovalUpdatePayload {
  title?: string
  subject?: string
  message_text?: string
  html_body?: string
}

export interface ApprovalListResponse {
  items: ApprovalRequest[]
  pending_count?: number
  approved_count?: number
  sent_count?: number
  rejected_count?: number
  total_visible_count?: number
  returned_count?: number
}

export interface ApprovalSendResponse {
  id: number
  status: ApprovalStatus
  delivered_count: number
  failed_count: number
}

export type ApprovalSuperadmin = AuthUser
