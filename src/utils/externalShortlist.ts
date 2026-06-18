/**
 * External Shortlist Helpers
 *
 * What this file does
 * -------------------
 * This file contains the helper logic used to shortlist external feed items
 * before they are shown in the UI.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the normalization helpers first, then the shortlist decision logic.
 * The shortlist rules are intentionally kept separate from the rendering code.
 *
 * When to change this file
 * ------------------------
 * Update this file when the external shortlist criteria changes or when the
 * feed needs a new matching rule.
 *
 * What this file does not do
 * --------------------------
 * This file does not fetch external stories or render cards. It only decides
 * which items qualify for the shortlist.
 */

import type { ExternalNewsCandidate } from '../api/externalNews'

export type InsightKind = 'business' | 'security'

export type ExternalShortlistState = {
  business: string[]
  security: string[]
}

const SHORTLIST_STORAGE_KEY = 'external_feed_shortlist_v1'
const SHORTLIST_HANDOFF_KEY = 'external_feed_shortlist_handoff_v1'
const EXTERNAL_FEED_LOOKBACK_DAYS_KEY = 'external_feed_lookback_days_v1'

const EMPTY_STATE: ExternalShortlistState = {
  business: [],
  security: [],
}

const DEFAULT_EXTERNAL_FEED_LOOKBACK_DAYS = 1
const ALLOWED_EXTERNAL_FEED_LOOKBACK_DAYS = new Set([1, 2, 3, 7])

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function scopedStorageKey(baseKey: string, scope?: string | null): string {
  const normalized = String(scope || '').trim().toLowerCase()
  if (!normalized) return baseKey
  return `${baseKey}:${normalized.replace(/[^a-z0-9._-]+/g, '_')}`
}

export function loadExternalShortlist(scope?: string | null): ExternalShortlistState {
  if (typeof window === 'undefined') return EMPTY_STATE
  try {
    const raw = window.localStorage.getItem(scopedStorageKey(SHORTLIST_STORAGE_KEY, scope))
    if (!raw) return EMPTY_STATE
    const parsed = JSON.parse(raw) as Partial<ExternalShortlistState>
    return {
      business: normalizeIds(parsed.business),
      security: normalizeIds(parsed.security),
    }
  } catch {
    return EMPTY_STATE
  }
}

export function saveExternalShortlist(state: ExternalShortlistState, scope?: string | null): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    scopedStorageKey(SHORTLIST_STORAGE_KEY, scope),
    JSON.stringify({
      business: normalizeIds(state.business),
      security: normalizeIds(state.security),
    }),
  )
}

export function loadExternalFeedLookbackDays(): number {
  if (typeof window === 'undefined') return DEFAULT_EXTERNAL_FEED_LOOKBACK_DAYS
  const raw = Number(window.localStorage.getItem(EXTERNAL_FEED_LOOKBACK_DAYS_KEY) || '')
  return ALLOWED_EXTERNAL_FEED_LOOKBACK_DAYS.has(raw) ? raw : DEFAULT_EXTERNAL_FEED_LOOKBACK_DAYS
}

export function saveExternalFeedLookbackDays(days: number): void {
  if (typeof window === 'undefined') return
  const normalized = ALLOWED_EXTERNAL_FEED_LOOKBACK_DAYS.has(days)
    ? days
    : DEFAULT_EXTERNAL_FEED_LOOKBACK_DAYS
  window.localStorage.setItem(EXTERNAL_FEED_LOOKBACK_DAYS_KEY, String(normalized))
}

export function candidateKind(candidate: ExternalNewsCandidate): InsightKind {
  return candidate.requested_kind === 'business' ? 'business' : 'security'
}

export type ShortlistHandoffTarget = InsightKind | 'both'

type ShortlistHandoffPayload = {
  target: ShortlistHandoffTarget
  requested_at: string
  selected_business: ExternalNewsCandidate[]
  selected_security: ExternalNewsCandidate[]
}

export function enqueueShortlistHandoff(
  target: ShortlistHandoffTarget,
  selectedBusiness: ExternalNewsCandidate[],
  selectedSecurity: ExternalNewsCandidate[],
  scope?: string | null,
): void {
  if (typeof window === 'undefined') return
  const payload: ShortlistHandoffPayload = {
    target,
    requested_at: new Date().toISOString(),
    selected_business: selectedBusiness,
    selected_security: selectedSecurity,
  }
  window.localStorage.setItem(scopedStorageKey(SHORTLIST_HANDOFF_KEY, scope), JSON.stringify(payload))
}

export type ConsumedShortlistHandoff = {
  target: ShortlistHandoffTarget
  selected_business: ExternalNewsCandidate[]
  selected_security: ExternalNewsCandidate[]
}

export function consumeShortlistHandoff(scope?: string | null): ConsumedShortlistHandoff | null {
  if (typeof window === 'undefined') return null
  try {
    const key = scopedStorageKey(SHORTLIST_HANDOFF_KEY, scope)
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    window.localStorage.removeItem(key)
    const parsed = JSON.parse(raw) as Partial<ShortlistHandoffPayload>
    const target = String(parsed.target || '')
    if (target === 'business' || target === 'security' || target === 'both') {
      return {
        target,
        selected_business: Array.isArray(parsed.selected_business) ? parsed.selected_business as ExternalNewsCandidate[] : [],
        selected_security: Array.isArray(parsed.selected_security) ? parsed.selected_security as ExternalNewsCandidate[] : [],
      }
    }
    return null
  } catch {
    return null
  }
}
