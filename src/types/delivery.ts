/**
 * Delivery Contracts
 *
 * What this file does
 * -------------------
 * This file defines the TypeScript contracts for advisory delivery requests,
 * delivery history, and delivery summaries.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the send-request payloads first, then the history and summary response
 * shapes. That follows the sequence used in the delivery screens.
 *
 * When to change this file
 * ------------------------
 * Update this file when the delivery backend changes the request or history
 * schema.
 *
 * What this file does not do
 * --------------------------
 * This file does not send advisories or interpret delivery state. It only
 * describes the shared data shape.
 */

﻿/**
 * Module: Delivery
 * Purpose: Core module responsible for Delivery concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

export type DeliveryChannel = 'email' | 'whatsapp'
export type DeliveryStatus = 'queued' | 'delivered' | 'failed'

export interface NotificationDelivery {
  id: number
  notification_id: number
  channel: DeliveryChannel
  contact_id: number | null
  destination: string
  subject: string | null
  message_text: string
  provider: string
  status: DeliveryStatus
  external_message_id: string | null
  error_message: string | null
  sent_at: string | null
  created_at: string
}

export interface DeliveryHistoryItem extends NotificationDelivery {
  notification_heading: string | null
  notification_status: string
  notification_incident_type: string | null
  notification_severity: string | null
  notification_business_impact: string | null
}

export interface DeliveryHistoryFilters {
  channel?: DeliveryChannel
  status?: DeliveryStatus
  notification_id?: number
  date_from?: string
  date_to?: string
  page?: number
  page_size?: number
}

export interface DeliveryHistoryResponse {
  items: DeliveryHistoryItem[]
  total: number
  page: number
  page_size: number
}

export interface DeliveryCategorySummaryItem {
  category: string
  email_count: number
  notification_count: number
}

export interface DeliveryRegionSummaryItem {
  region: string
  email_count: number
  notification_count: number
}

export interface DeliveryAdvisorySummaryItem {
  notification_id: number
  advisory_sent: string
  incident_type: string
  affected_properties: string[]
  regions: string[]
  email_count: number
}

export interface DeliverySummaryResponse {
  total_email_count: number
  total_notification_count: number
  advisories_email_count: number
  business_insights_email_count: number
  daily_news_summary_email_count: number
  advisories_notification_count: number
  business_insights_notification_count: number
  daily_news_summary_notification_count: number
  categories: DeliveryCategorySummaryItem[]
  regions: DeliveryRegionSummaryItem[]
  advisories: DeliveryAdvisorySummaryItem[]
}

export interface DeliveryRequest {
  channels: DeliveryChannel[]
  contact_ids: number[]
  group_ids: number[]
  exclude_contact_ids: number[]
}

export interface DirectEmailRequest {
  destination: string
  subject?: string
  message_text?: string
  html_body?: string
}

export interface DeliveryBatchResponse {
  notification_id: number
  deliveries: NotificationDelivery[]
  delivered_count: number
  failed_count: number
}

