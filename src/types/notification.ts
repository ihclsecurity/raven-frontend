/**
 * Notification Contracts
 *
 * What this file does
 * -------------------
 * This file defines the shared notification, approval, generation, and list
 * response contracts used throughout the advisory workflow.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the notification record first, then the creation and generation payloads,
 * and finally the approval-related payloads. That order matches the lifecycle
 * of an advisory.
 *
 * When to change this file
 * ------------------------
 * Update this file when the backend notification schema changes or when new
 * workflow metadata is introduced.
 *
 * What this file does not do
 * --------------------------
 * This file does not decide workflow state. It only describes the shared data
 * model.
 */

﻿/**
 * Module: Notification
 * Purpose: Core module responsible for Notification concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

export type NotificationStatus = 'draft' | 'saved' | 'ready' | 'sent' | 'archived'
export type ApprovalStatus = 'not_requested' | 'pending' | 'approved' | 'rejected' | 'overridden'
export type ApprovalRequestChannel = 'email' | 'whatsapp'
export type SeverityLevel = 'Catastrophic' | 'Major' | 'Moderate' | 'Minor' | 'Informational'
export type ConfidenceLevel = 'Confirmed' | 'Likely' | 'Unconfirmed'

export interface LlmRuntimeInfo {
  requested_provider: string
  provider: string
  model: string
  fallback_used: boolean
  fallback_reason: string | null
}

export interface MetadataExtractionResponse {
  severity?: SeverityLevel | null
  confidence?: ConfidenceLevel | null
  business_impact?: string | null
  incident_type?: string | null
  geography?: Record<string, unknown> | null
  llm_runtime?: LlmRuntimeInfo | null
}

export interface Notification {
  id: number
  heading: string | null
  email_subject: string | null
  template_id: number | null
  tone: string | null
  severity: SeverityLevel | null
  confidence: ConfidenceLevel | null
  business_impact: string | null
  incident_type: string | null
  geography_json: string | null
  tags_json: string | null
  source_text: string | null
  custom_instructions: string | null
  generated_text: string | null
  edited_text: string | null
  final_text: string | null
  channel_email_text: string | null
  status: NotificationStatus
  approval_status: ApprovalStatus
  approval_required: boolean
  requested_approver_id: number | null
  approval_requested_at: string | null
  approval_request_channel: ApprovalRequestChannel | null
  approval_request_destination: string | null
  approval_request_subject: string | null
  approval_request_message: string | null
  approval_request_provider: string | null
  approval_request_status: string | null
  approval_request_external_id: string | null
  approval_request_sent_at: string | null
  approval_decision_by_id: number | null
  approval_decision_at: string | null
  approval_notes: string | null
  approval_response_channel: ApprovalRequestChannel | null
  approval_response_text: string | null
  approval_override_used: boolean
  approval_override_reason: string | null
  llm_requested_provider: string | null
  llm_provider: string | null
  llm_model: string | null
  llm_fallback_used: boolean
  llm_fallback_reason: string | null
  created_at: string
  updated_at: string
}

export interface NotificationCreate {
  heading?: string
  email_subject?: string
  template_id?: number
  tone?: string
  severity?: SeverityLevel
  confidence?: ConfidenceLevel
  business_impact?: string
  incident_type?: string
  geography_json?: string
  tags_json?: string
  source_text?: string
  custom_instructions?: string
  generated_text?: string
  channel_email_text?: string
}

export interface NotificationGeneratePayload {
  provider_mode?: 'azure_openai'
  azure_openai_endpoint?: string
  azure_openai_api_key?: string
  azure_openai_deployment?: string
  azure_openai_api_version?: string
  template_id?: number
}

export interface NotificationListResponse {
  items: Notification[]
  total: number
  page: number
  page_size: number
}

export interface NotificationFilters {
  status?: string
  severity?: string
  template_id?: number
  approval_status?: string
  date_from?: string
  date_to?: string
  search?: string
  page?: number
  page_size?: number
}

export interface ApprovalDecisionPayload {
  approver_contact_id: number
  notes?: string
}

export interface ApprovalRequestPayload {
  approver_contact_id: number
  channel: ApprovalRequestChannel
}

export interface ApprovalImportReplyPayload {
  approver_contact_id: number
  decision: 'approved' | 'rejected'
  channel?: ApprovalRequestChannel
  notes?: string
  reply_text?: string
  edited_message?: string
}

export interface ApprovalOverridePayload {
  reason?: string
}

