/**
 * Settings API
 *
 * What this file does
 * -------------------
 * This file wraps the application settings endpoints, including the LLM
 * connection check and the editable configuration values shown in admin screens.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the settings fetch methods first, then the update and test helpers. The
 * UI uses this file for both persistent configuration and live validation.
 *
 * When to change this file
 * ------------------------
 * Update this file when the backend adds new settings fields or changes the LLM
 * connectivity test.
 *
 * What this file does not do
 * --------------------------
 * This file does not store settings locally or infer defaults. It only wraps
 * the backend configuration routes.
 */

import client from './client'

export const settingsApi = {
  getAll: () => client.get<Record<string, string>>('/settings').then((r) => r.data),
  get: (key: string) => client.get<{ key: string; value: unknown }>(`/settings/${key}`).then((r) => r.data),
  set: (key: string, value: unknown) => client.put(`/settings/${key}`, { value }).then((r) => r.data),
  getWebhookInfo: () =>
    client.get<{
      callback_urls: Record<string, string>
      security: {
        shared_webhook_token_set: boolean
        graph_client_state_set: boolean
        twilio_signature_verification_enabled: boolean
        public_base_url_configured: boolean
      }
      diagnostics?: {
        effective_base_url: string
        request_base_url: string
        backend_url: string | null
        warnings: string[]
      }
    }>('/settings/webhook/info').then((r) => r.data),
  testLlmConnection: (payload: Record<string, unknown>) =>
    client.post<{ ok: boolean; provider: string; model: string; detail: string }>('/settings/llm/test', payload).then((r) => r.data),
  testDatasurfrConnection: () =>
    client.post<{
      ok: boolean
      detail: string
      token_preview?: string
      property_mapping?: {
        available: boolean
        row_count: number
        active_path: string | null
        configured_path: string | null
        checked_paths: string[]
        detail: string
      }
    }>('/settings/datasurfr/test').then((r) => r.data),
  getKnowledgeBaseStatus: () =>
    client.get<{
      ok: boolean
      document_name: string
      document_kind: string
      configured_source_path: string
      source_exists: boolean
      indexed: boolean
      indexed_matches_source: boolean
      chunk_count: number
      embedding_provider: string | null
      embedding_model: string | null
      section_count: number
      page_count: number
      stored_source_path: string | null
      updated_at: string | null
    }>('/settings/knowledge-base/status').then((r) => r.data),
  reindexKnowledgeBase: () =>
    client.post<{
      ok: boolean
      document_name: string
      document_kind: string
      source_path: string
      section_count: number
      chunk_count: number
      embedding_provider: string
      embedding_model: string
    }>('/settings/knowledge-base/reindex').then((r) => r.data),
  getLlmDiagnostics: (payload: Record<string, unknown>) =>
    client.post<{
      requested_provider: string
      fallback_policy: { enabled: boolean; trigger: string; target_provider: string }
      providers: Record<string, { ok: boolean; provider: string; model: string; detail: string }>
    }>('/settings/llm/diagnostics', payload).then((r) => r.data),
  testTransportConnection: (payload: Record<string, unknown>) =>
    client.post<{ ok: boolean; channel: string; provider: string; status: string; external_message_id: string | null; error_message: string | null }>('/settings/transport/test', payload).then((r) => r.data),
}

