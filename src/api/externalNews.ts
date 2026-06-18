/**
 * External News API
 *
 * What this file does
 * -------------------
 * This file wraps the external news feed endpoints used by the news and
 * shortlist screens.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the feed retrieval methods first, then the shortlist or enrichment
 * helpers if present. The UI treats this file as the network layer for external
 * intelligence sources.
 *
 * When to change this file
 * ------------------------
 * Update this file when the external news backend changes its paging, filters,
 * or response shape.
 *
 * What this file does not do
 * --------------------------
 * This file does not rank or interpret articles. It only fetches them.
 */

import client from './client'
import type { DatasurfrAlert } from '../types/datasurfr'
import type { NotificationGeneratePayload } from '../types/notification'

export interface ExternalFeedSource {
  kinds: Array<'business' | 'security'>
  used_for: string[]
  publisher: string
  label: string
  url: string
  geography_scope: 'India' | 'International' | string
  coverage_tags: string[]
  coverage_tag_labels: string[]
  trust_weight: number
  enabled: boolean
}

export interface ExternalFeedSourcesResponse {
  business: ExternalFeedSource[]
  security: ExternalFeedSource[]
}

export interface ExternalNewsCandidate {
  id: string
  title: string
  description: string | null
  published_at: string | null
  publisher: string
  feed_label: string
  feed_url: string
  article_url: string
  canonical_url: string
  requested_kind: 'business' | 'security'
  source_kinds: Array<'business' | 'security'>
  used_for: string[]
  geography_scope: 'India' | 'International' | string
  coverage_tags: string[]
  coverage_tag_labels: string[]
  source_trust_weight: number
  relevance_score: number
  language: string | null
  freshness_status: 'fresh' | 'within_window' | 'unknown_date' | 'stale' | 'future_date' | string
  dedupe_status: 'primary' | 'duplicate' | string
  duplicate_count: number
  duplicate_of: string | null
  category_key: string
  category_label: string
  importance_score: number
  importance_reasons: string[]
  rank: number
}

export interface ExternalNewsListResponse {
  items: ExternalNewsCandidate[]
  total_available: number
  returned_count: number
  requested_limit: number
}

export interface ExternalNewsCountsResponse {
  business: number
  security: number
  all: number
}

export interface InsightCurationPayload extends NotificationGeneratePayload {
  kind: 'business' | 'security'
  title: string
  coverage_label: string
  max_items: number
  candidates: DatasurfrAlert[]
}

export interface InsightCurationResponse {
  selected_ids: string[]
  categorized_ids?: Record<string, string>
  llm_used: boolean
  llm_error?: string | null
  llm_provider?: string | null
  llm_model?: string | null
  curation_prompt?: string | null
}

export const externalNewsApi = {
  listSources: () =>
    client
      .get<ExternalFeedSourcesResponse>('/external-news/sources')
      .then((response) => response.data),
  listInsightsNews: (kind: 'business' | 'security', limit = 25, days = 2) =>
    client
      .get<ExternalNewsListResponse>('/external-news/insights', { params: { kind, limit, days } })
      .then((response) => response.data),
  listInsightCounts: (days = 2) =>
    client
      .get<ExternalNewsCountsResponse>('/external-news/insights-counts', { params: { days } })
      .then((response) => response.data),
  curateInsights: (payload: InsightCurationPayload) =>
    client
      .post<InsightCurationResponse>('/external-news/curate', payload)
      .then((response) => response.data),
}
