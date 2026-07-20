/**
 * Module: Send Insights
 * Purpose: Curate two daily insight drafts and send them via email from a single page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import { ChevronRight, Download, Loader2, RefreshCw, Send, Users, X } from 'lucide-react'
import { notificationsApi } from '../api/notifications'
import { datasurfrApi } from '../api/datasurfr'
import { externalNewsApi, type ExternalNewsCandidate } from '../api/externalNews'
import type { DatasurfrAlert, DatasurfrMapProperty } from '../types/datasurfr'
import type { Notification } from '../types/notification'
import { consumeShortlistHandoff, loadExternalFeedLookbackDays, loadExternalShortlist } from '../utils/externalShortlist'
import { emailGroupsApi } from '../api/emailGroups'
import { useAuth } from '../auth/AuthContext'
import { approvalsApi } from '../api/approvals'
import { apiTime } from '../utils/dateTime'
import { useSettings } from '../hooks/useSettings'
import { buildAzureOpenAiPayload } from '../utils/azureOpenAi'

type InsightKind = 'business' | 'security'

type InsightConfig = {
  key: InsightKind
  title: string
  scheduleLabel: string
  headingPrefix: string
  coverageLabel: string
}

type InsightCardState = {
  generating: boolean
  error: string | null
  viewMode: 'template' | 'text'
  notification: Notification | null
  selected: DatasurfrAlert[]
}

type PropertyEmailSuggestion = {
  email: string
  label: string
  searchText: string
}

type SendInsightsGuideStep = {
  key: string
  title: string
  description: string
  points: string[]
  targetId: string
}

const SEND_INSIGHTS_GUIDE_STEPS: SendInsightsGuideStep[] = [
  {
    key: 'top-nav',
    title: 'Page Context',
    description: 'Use this page to generate two briefing products from external feed items and send them in one flow.',
    points: [
      'Business insight is aimed at leadership and market-impact awareness.',
      'Daily news summary is focused on general news coverage.',
    ],
    targetId: 'dashboard-guide-topbar',
  },
  {
    key: 'mail-controls',
    title: 'Recipient And Dispatch',
    description: 'Set the recipient address and send Business, Summary, or Both in one click after generation.',
    points: [
      'Send buttons stay disabled while a send is in progress.',
      'Feedback below shows success or validation errors.',
    ],
    targetId: 'send-insights-guide-mail',
  },
  {
    key: 'business-card',
    title: 'Business Insight Card',
    description: 'Auto-generate this card from shortlisted business signals, then review before dispatch.',
    points: [
      'Refresh rebuilds the output with latest shortlist context.',
      'Download exports the rendered HTML template for review or archive.',
    ],
    targetId: 'send-insights-guide-business',
  },
  {
    key: 'security-card',
    title: 'Daily News Summary Card',
    description: 'This card balances India and International coverage for daily security monitoring.',
    points: [
      'Generation uses prioritization and fallback logic from the external feed.',
      'Use Preview for email layout and Text for plain-content verification.',
    ],
    targetId: 'send-insights-guide-security',
  },
  {
    key: 'view-modes',
    title: 'Preview And Text QA',
    description: 'Switch between Preview and Text to validate formatting, links, and message clarity before sending.',
    points: [
      'Preview shows final email rendering for recipients.',
      'Text mode helps quick proofreading and content checks.',
    ],
    targetId: 'send-insights-guide-view-controls',
  },
]

const MAX_BUSINESS_ALERTS = 35
const MAX_SECURITY_PRIORITY_ALERTS = 35
const EXTERNAL_BUSINESS_LIMIT = 100
const EXTERNAL_SECURITY_LIMIT = 80
const IHCL_LOGO_SRC = '/ihcl_logo_white.png'
const OMNI_LOGO_SRC = '/omni.png'
const INSIGHTS_TEMPLATE_VERSION = 'RAVEN_SEND_INSIGHTS_TEMPLATE_V18'
const BUSINESS_CURATION_VERSION = 'BUSINESS_CURATION_V3_TECH_WEATHER'
const assetDataUrlCache = new Map<string, string>()
const SESSION_QUERY_STALE_TIME = Number.POSITIVE_INFINITY

const BUSINESS_AUTO_CATEGORY_LABELS = [
  'Supply Chain, Fuel, and Logistics',
  'Hospitality & Hotel Chains',
  'Regulatory, Policy, and Compliance',
  'Aviation and Travel Operations',
  'Hospitality Technology & AI',
  'Macro-Economy and Finance',
]

const SUMMARY_AUTO_CATEGORY_LABELS = [
  'India Economy & Finance',
  'International Geopolitics & Conflicts',
  'India Security & Disruptions',
  'India Politics & Governance',
  'International Economy & Trade',
  'Global Technology & Cyber',
  'Natural Disasters & Climate Events',
]

function insightIncidentType(kind: InsightKind): string {
  return kind === 'business' ? 'Daily Business Insights' : 'Daily News Summary'
}

function compareExternalByImportance(a: ExternalNewsCandidate, b: ExternalNewsCandidate): number {
  if ((b.importance_score || 0) !== (a.importance_score || 0)) {
    return (b.importance_score || 0) - (a.importance_score || 0)
  }
  const aTime = Date.parse(a.published_at || '') || 0
  const bTime = Date.parse(b.published_at || '') || 0
  return bTime - aTime
}

function topCandidatesPerCategory(
  candidates: ExternalNewsCandidate[],
  expectedCategoryLabels: string[],
  perCategory = 6,
): ExternalNewsCandidate[] {
  const byCategory = new Map<string, ExternalNewsCandidate[]>()
  const sorted = [...candidates].sort(compareExternalByImportance)
  const normalizedExpected = expectedCategoryLabels.map((label) => label.trim().toLowerCase())
  const expectedSet = new Set(normalizedExpected)
  sorted.forEach((candidate) => {
    const key = String(candidate.category_label || candidate.category_key || 'General')
      .trim()
      .toLowerCase()
    if (!expectedSet.has(key)) return
    const bucket = byCategory.get(key) || []
    if (bucket.length < perCategory) {
      bucket.push(candidate)
      byCategory.set(key, bucket)
    }
  })
  return normalizedExpected.flatMap((key) => byCategory.get(key) || [])
}

function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

function formatCoverageRangeFromCandidates(candidates: ExternalNewsCandidate[], fallbackDate: Date): string {
  const timestamps = candidates
    .map((item) => Date.parse(String(item.published_at || '').trim()))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)

  if (!timestamps.length) {
    return formatLongDate(fallbackDate)
  }

  const start = new Date(timestamps[0])
  const end = new Date(timestamps[timestamps.length - 1])
  const startDay = start.getDate()
  const endDay = end.getDate()
  const sameMonth = start.getMonth() === end.getMonth()
  const sameYear = start.getFullYear() === end.getFullYear()

  if (sameMonth && sameYear) {
    const monthYear = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(end)
    if (startDay === endDay) {
      return `${startDay} ${monthYear}`
    }
    return `${startDay}-${endDay} ${monthYear}`
  }

  if (sameYear) {
    const startPart = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(start)
    const endPart = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(end)
    return `${startPart}-${endPart} ${end.getFullYear()}`
  }

  const startPart = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(start)
  const endPart = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(end)
  return `${startPart}-${endPart}`
}

function buildInsightCacheSignature(kind: InsightKind): string {
  const curationVersion = kind === 'business' ? BUSINESS_CURATION_VERSION : 'SECURITY_SUMMARY_V1'
  return `RAVEN_SEND_INSIGHTS_SIG:${kind}:${curationVersion}`
}

function insightLinksForAlert(alert: DatasurfrAlert): string[] {
  return (alert.source_links || []).slice(0, 4)
}

function isInternationalNewsAlert(alert: DatasurfrAlert): boolean {
  const externalScope = String(alert.external_feed_scope || '').toLowerCase()
  if (externalScope.includes('international')) return true
  if (externalScope === 'india') return false

  const location = String(alert.event_location || '').toLowerCase()
  const scope = String(alert.impact_scope || '').toLowerCase()
  const source = String(alert.sub_risk_category_name || '').toLowerCase()
  if (location.includes('global') || scope.includes('global') || scope.includes('international')) {
    return true
  }
  return [
    'al jazeera',
    'bbc',
    'deutsche welle',
    'france 24',
    'npr',
    'the guardian',
    'the new york times',
    'un news',
  ].some((item) => source.includes(item))
}

function newsScopeLabel(alert: DatasurfrAlert): 'India' | 'International' {
  return isInternationalNewsAlert(alert) ? 'International' : 'India'
}

function setNewsScope(alert: DatasurfrAlert, scope: 'India' | 'International'): DatasurfrAlert {
  return {
    ...alert,
    external_feed_scope: scope,
    impact_scope: scope === 'International' ? 'Global' : 'National',
    event_location: scope === 'International' ? 'International' : 'India',
  }
}

function externalCandidateToAlert(candidate: ExternalNewsCandidate): DatasurfrAlert {
  const isInternational = String(candidate.geography_scope || '').toLowerCase().includes('international')
  const impactScope = isInternational ? 'Global' : 'National'
  const impactScore = Math.max(1, Math.min(100, Math.round((candidate.relevance_score || 0) + (candidate.source_trust_weight || 0) * 40)))

  return {
    id: candidate.id,
    event_title: candidate.title,
    event_description: candidate.description,
    event_date: candidate.published_at,
    event_location: candidate.geography_scope || (isInternational ? 'International' : 'India'),
    incident_type: candidate.requested_kind === 'business' ? 'Business News' : 'Daily News',
    risk_category: candidate.requested_kind === 'business' ? 'Business' : 'News',
    sub_risk_category_name: candidate.publisher,
    latitude: null,
    longitude: null,
    latest_update: candidate.published_at,
    latest_update_local: null,
    latest_update_age_minutes: null,
    hotel_impact_score: impactScore,
    hotel_impact_level: impactScore >= 70 ? 'high' : impactScore >= 40 ? 'medium' : 'low',
    hotel_impact_reasons: [
      `External source: ${candidate.publisher}`,
      ...(candidate.coverage_tag_labels || []).slice(0, 2),
    ],
    impact_radius_km: 0,
    language: candidate.language,
    source_links: candidate.article_url ? [candidate.article_url] : [],
    mapped_regions: [],
    primary_mapped_region: null,
    impacted_property_count: 0,
    impacted_properties_preview: [],
    impacted_properties_all: [],
    impact_scope: impactScope,
    impact_scope_states: [],
    impact_scope_countries: [],
    impact_scope_confidence: 'medium',
    impact_scope_reason: `External RSS item from ${candidate.publisher}.`,
    previously_imported: false,
    prior_import_count: 0,
    external_feed_kind: candidate.requested_kind,
    external_feed_label: candidate.feed_label,
    external_feed_url: candidate.feed_url,
    external_feed_scope: isInternational ? 'International' : 'India',
    external_feed_coverage_tags: candidate.coverage_tags,
    external_feed_coverage_labels: candidate.coverage_tag_labels,
    external_feed_canonical_url: candidate.canonical_url,
    external_feed_freshness_status: candidate.freshness_status,
    external_feed_duplicate_count: candidate.duplicate_count,
  }
}

function titleKey(alert: DatasurfrAlert): string {
  return String(alert.event_title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function dedupeAlerts(alerts: DatasurfrAlert[]): DatasurfrAlert[] {
  const seen = new Set<string>()
  const output: DatasurfrAlert[] = []
  alerts.forEach((alert) => {
    const key = titleKey(alert) || alert.source_links[0] || alert.id
    if (!key || seen.has(key)) return
    seen.add(key)
    output.push(alert)
  })
  return output
}

function ensureSecuritySummaryBalance(
  selected: DatasurfrAlert[],
  candidates: DatasurfrAlert[],
  maxAlerts: number,
): DatasurfrAlert[] {
  const rankedCandidates = candidates.filter((candidate) => candidate.id)
  const output = selected.filter((item) => rankedCandidates.some((candidate) => candidate.id === item.id))
  const internationalCandidates = rankedCandidates.filter(isInternationalNewsAlert)
  const indiaCandidates = rankedCandidates.filter((item) => !isInternationalNewsAlert(item))
  const minInternational = Math.min(10, internationalCandidates.length)
  const minIndia = Math.min(10, indiaCandidates.length)
  const hasId = (id: string) => output.some((item) => item.id === id)
  const internationalCount = () => output.filter(isInternationalNewsAlert).length
  const indiaCount = () => output.length - internationalCount()

  const addFromPool = (
    pool: DatasurfrAlert[],
    targetReached: () => boolean,
    replaceable: (item: DatasurfrAlert) => boolean,
  ) => {
    for (const candidate of pool) {
      if (targetReached()) break
      if (hasId(candidate.id)) continue
      if (output.length >= maxAlerts) {
        const replaceIndex = output.findIndex(replaceable)
        if (replaceIndex < 0) break
        output.splice(replaceIndex, 1)
      }
      output.push(candidate)
      if (output.length >= maxAlerts && !output.some(replaceable)) break
    }
  }

  if (internationalCount() < minInternational) {
    addFromPool(
      internationalCandidates,
      () => internationalCount() >= minInternational,
      (item) => !isInternationalNewsAlert(item) && indiaCount() > minIndia,
    )
  }
  if (indiaCount() < minIndia) {
    addFromPool(
      indiaCandidates,
      () => indiaCount() >= minIndia,
      (item) => isInternationalNewsAlert(item) && internationalCount() > minInternational,
    )
  }

  const seen = new Set<string>()
  return output
    .filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
    .slice(0, maxAlerts)
}

function newsSummaryGroups(selected: DatasurfrAlert[]): { india: DatasurfrAlert[]; international: DatasurfrAlert[] } {
  return {
    india: selected.filter((alert) => !isInternationalNewsAlert(alert)),
    international: selected.filter(isInternationalNewsAlert),
  }
}

function compactAlertForCuration(alert: DatasurfrAlert): DatasurfrAlert {
  return {
    ...alert,
    event_description: alert.event_description
      ? alert.event_description.replace(/\s+/g, ' ').trim().slice(0, 700)
      : null,
    hotel_impact_reasons: (alert.hotel_impact_reasons || []).slice(0, 3),
    mapped_regions: (alert.mapped_regions || []).slice(0, 6),
    impacted_properties_preview: (alert.impacted_properties_preview || []).slice(0, 5),
    impacted_properties_all: [],
    source_links: (alert.source_links || []).slice(0, 3),
  }
}

async function curateAlertsWithLlm(
  kind: InsightKind,
  config: InsightConfig,
  candidates: DatasurfrAlert[],
  fallbackSelected: DatasurfrAlert[],
  maxItems: number,
  azureOpenAiPayload: ReturnType<typeof buildAzureOpenAiPayload>,
): Promise<{ selected: DatasurfrAlert[]; prompt: string }> {
  if (!candidates.length) return { selected: fallbackSelected, prompt: '' }
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]))

  try {
    const response = await externalNewsApi.curateInsights({
      kind,
      title: config.title,
      coverage_label: config.coverageLabel,
      max_items: maxItems,
      candidates: candidates.map(compactAlertForCuration),
      ...azureOpenAiPayload,
    })
    const selected = response.selected_ids
      .map((id) => candidatesById.get(id))
      .filter((item): item is DatasurfrAlert => Boolean(item))
    const fallback = fallbackSelected
    const balancedSelected = kind === 'security'
      ? ensureSecuritySummaryBalance(selected.length ? selected : fallback, candidates, maxItems)
      : (selected.length ? selected : fallback).slice(0, maxItems)
    return {
      selected: balancedSelected.length ? balancedSelected : fallback,
      prompt: String(response.curation_prompt || ''),
    }
  } catch {
    const fallback = fallbackSelected
    return {
      selected: kind === 'security'
        ? ensureSecuritySummaryBalance(fallback, candidates, maxItems)
        : fallback.slice(0, maxItems),
      prompt: '',
    }
  }
}

function extractWorkingText(notification: Notification): string {
  return (notification.final_text || notification.edited_text || notification.generated_text || '').trim()
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function splitEmails(value?: string | null): string[] {
  return String(value || '')
    .split(/[;,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function propertyEmailSuggestions(property: DatasurfrMapProperty): PropertyEmailSuggestion[] {
  const propertyName = String(property.property_name || '').trim()
  const brand = String(property.brand || '').trim()
  const city = String(property.city || '').trim()
  const suggestions: PropertyEmailSuggestion[] = []
  for (const email of splitEmails(property.gm_email)) {
    const name = String(property.gm_name || '').trim()
    suggestions.push({
      email,
      label: ['GM', name, propertyName, brand, city].filter(Boolean).join(' - '),
      searchText: [email, name, propertyName, brand, city, 'GM'].filter(Boolean).join(' '),
    })
  }
  for (const email of splitEmails(property.sm_email)) {
    const name = String(property.sm_name || '').trim()
    suggestions.push({
      email,
      label: ['SM', name, propertyName, brand, city].filter(Boolean).join(' - '),
      searchText: [email, name, propertyName, brand, city, 'SM'].filter(Boolean).join(' '),
    })
  }
  return suggestions
}

function uniqueEmailSuggestions(values: PropertyEmailSuggestion[]): PropertyEmailSuggestion[] {
  const seen = new Set<string>()
  const output: PropertyEmailSuggestion[] = []
  for (const item of values) {
    const email = item.email.trim()
    if (!email || !isLikelyEmail(email)) continue
    const key = normalizeEmail(email)
    if (seen.has(key)) continue
    seen.add(key)
    output.push({ ...item, email })
  }
  return output
}

const INSIGHTS_PREVIEW_BASE_STYLES = `
html, body {
  margin: 0 !important;
  padding: 0 !important;
  background: #ffffff;
}
body > table[role="presentation"]:first-of-type {
  margin: 0 !important;
  padding: 0 !important;
  background: #ffffff !important;
}
body > table[role="presentation"]:first-of-type > tbody > tr > td {
  padding: 0 !important;
}
body > table[role="presentation"]:first-of-type > tbody > tr > td > table[role="presentation"] {
  width: 100% !important;
  max-width: none !important;
  border-left: 0 !important;
  border-right: 0 !important;
  border-radius: 0 !important;
}
* {
  box-sizing: border-box;
}
`

function previewScrollbarStyles(): string {
  const isLightTheme = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light'
  if (isLightTheme) {
    return `
html, body {
  scrollbar-width: thin;
  scrollbar-color: #7c9ecb #e5edf7;
}
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
::-webkit-scrollbar-track {
  background: #e5edf7;
}
::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #8db0dc 0%, #7196c5 100%);
  border-radius: 999px;
}
::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #9dbce3 0%, #7196c5 100%);
}
`
  }

  return `
html, body {
  scrollbar-width: thin;
  scrollbar-color: #2f9aaa #07111d;
}
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
::-webkit-scrollbar-track {
  background: #07111d;
}
::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #36b6c8 0%, #2f9aaa 100%);
  border-radius: 999px;
}
::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #47cadb 0%, #2f9aaa 100%);
}
`
}

function previewInteractionStyles(): string {
  return `
tr[data-insight-alert-id] td:last-child {
  position: relative;
}
tr[data-insight-alert-id].insight-row-hover td {
  background: #eef6ff !important;
}
.insight-row-actions {
  position: absolute;
  right: 8px;
  transform: translateY(-2px);
  display: none;
  gap: 6px;
  z-index: 20;
  font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
}
tr[data-insight-alert-id].insight-row-hover .insight-row-actions {
  display: inline-flex;
}
.insight-row-actions button {
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #ffffff;
  color: #0f172a;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
}
.insight-row-actions button[data-action="remove"] {
  border-color: rgba(220, 38, 38, 0.35);
  color: #b91c1c;
}
.insight-row-actions button[data-action="scope"] {
  border-color: rgba(37, 99, 235, 0.36);
  color: #1d4ed8;
  font-weight: 600;
}
.insight-row-actions button[data-action="remove"] {
  min-width: 40px;
  padding: 5px 0;
  font-size: 15px;
  font-weight: 700;
}
`
}

function previewInteractionScript(kind?: InsightKind): string {
  if (!kind) return ''
  return `
<script>
(function () {
  var kind = ${JSON.stringify(kind)};
  function post(action, row) {
    if (!row) return;
    window.parent.postMessage({
      source: 'raven-send-insights-preview',
      action: action,
      kind: kind,
      alertId: row.getAttribute('data-insight-alert-id')
    }, '*');
  }
  function attach(row) {
    if (!row || row.querySelector('.insight-row-actions')) return;
    var controls = document.createElement('span');
    controls.className = 'insight-row-actions';
    var scopeButton = document.createElement('button');
    scopeButton.type = 'button';
    scopeButton.setAttribute('data-action', 'scope');
    scopeButton.textContent = row.getAttribute('data-insight-scope') === 'International' ? '→ India' : '→ International';
    scopeButton.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      post('toggle-scope', row);
    });
    var removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.setAttribute('data-action', 'remove');
    removeButton.textContent = 'x';
    removeButton.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      post('remove', row);
    });
    controls.appendChild(scopeButton);
    controls.appendChild(removeButton);
    (row.querySelector('td:last-child') || row).appendChild(controls);
    row.addEventListener('mouseenter', function () { row.classList.add('insight-row-hover'); });
    row.addEventListener('mouseleave', function () { row.classList.remove('insight-row-hover'); });
  }
  Array.prototype.forEach.call(document.querySelectorAll('tr[data-insight-alert-id]'), attach);
}());
</script>`
}

function buildPreviewDoc(rawHtml: string, kind?: InsightKind): string {
  const fallbackContent = `
    <div style="
      min-height:100%;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:24px;
      font-family:Segoe UI, Arial, sans-serif;
      color:#475569;
      background:linear-gradient(180deg,#f8fbff 0%,#f1f5f9 100%);
    ">
      <div style="text-align:center;max-width:360px;">
        <div style="font-size:20px;font-weight:700;margin:0 0 8px;">Select news items from external feed</div>
        <div style="font-size:14px;line-height:1.45;">Templates stay empty until you select items and refresh this insight.</div>
      </div>
    </div>
  `
  const content = rawHtml.trim() || fallbackContent
  const previewStyles = `${INSIGHTS_PREVIEW_BASE_STYLES}\n${previewScrollbarStyles()}\n${previewInteractionStyles()}`
  const previewScript = previewInteractionScript(kind)

  if (/<html[\s>]/i.test(content)) {
    let preview = content
    if (/<head[\s>]/i.test(preview)) {
      preview = preview.replace(/<head([^>]*)>/i, `<head$1><style>${previewStyles}</style>`)
    } else {
      preview = preview.replace(/<html([^>]*)>/i, `<html$1><head><style>${previewStyles}</style></head>`)
    }
    return preview.replace(/<\/body>/i, `${previewScript}</body>`)
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><style>${previewStyles}</style></head><body>${content}${previewScript}</body></html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function publicAssetUrl(path: string): string {
  if (typeof window === 'undefined') return path
  return new URL(path, window.location.origin).toString()
}

async function assetToDataUrl(path: string): Promise<string> {
  if (typeof window === 'undefined') return path
  const cached = assetDataUrlCache.get(path)
  if (cached) return cached

  try {
    const response = await fetch(path)
    if (!response.ok) throw new Error(`Failed to load asset: ${path}`)
    const blob = await response.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
    assetDataUrlCache.set(path, dataUrl)
    return dataUrl
  } catch {
    return publicAssetUrl(path)
  }
}

function loadHeaderImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load header asset.'))
    image.src = src
  })
}

function drawHeaderImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
) {
  const ratio = image.naturalWidth > 0 ? image.naturalHeight / image.naturalWidth : 1
  context.drawImage(image, x, y, width, Math.round(width * ratio))
}

function drawSoftHeaderBand(
  context: CanvasRenderingContext2D,
  fillStyle: string,
  points: Array<[number, number]>,
) {
  context.save()
  context.filter = 'blur(18px)'
  context.fillStyle = fillStyle
  context.beginPath()
  points.forEach(([x, y], index) => {
    if (index === 0) {
      context.moveTo(x, y)
      return
    }
    context.lineTo(x, y)
  })
  context.closePath()
  context.fill()
  context.restore()
}

async function buildOutlookHeaderImageDataUrl(
  config: InsightConfig,
  ihclLogoUrl: string,
  omniLogoUrl: string,
): Promise<string> {
  if (typeof document === 'undefined') return ''

  try {
    const [ihclLogo, omniLogo] = await Promise.all([
      loadHeaderImage(ihclLogoUrl),
      loadHeaderImage(omniLogoUrl),
    ])
    const width = 740
    const height = 206
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const context = canvas.getContext('2d')
    if (!context) return ''
    context.scale(scale, scale)

    const gradient = context.createLinearGradient(24, 0, width - 12, height)
    gradient.addColorStop(0, '#071426')
    gradient.addColorStop(0.46, '#123653')
    gradient.addColorStop(0.68, '#9aaab0')
    gradient.addColorStop(0.80, '#eef3f1')
    gradient.addColorStop(1, '#d9b45c')
    context.fillStyle = gradient
    context.fillRect(0, 0, width, height)

    drawSoftHeaderBand(context, 'rgba(7,20,38,0.20)', [
      [-36, -24],
      [392, -24],
      [316, height + 24],
      [-36, height + 24],
    ])

    drawSoftHeaderBand(context, 'rgba(255,255,255,0.24)', [
      [602, -24],
      [width + 36, -24],
      [width + 36, height + 24],
      [530, height + 24],
    ])

    drawHeaderImage(context, ihclLogo, 30, 20, 114)
    drawHeaderImage(context, omniLogo, width - 30 - 107, 20, 107)

    context.textAlign = 'center'
    context.fillStyle = '#ffffff'
    context.shadowColor = 'rgba(7,20,38,0.35)'
    context.shadowBlur = 2
    context.shadowOffsetY = 1
    context.font = '700 32px Aptos, Arial, Helvetica, sans-serif'
    context.fillText(config.title, width / 2, 140)
    context.font = '700 17px Aptos, Arial, Helvetica, sans-serif'
    context.fillText(config.coverageLabel, width / 2, 173)

    return canvas.toDataURL('image/png')
  } catch {
    return ''
  }
}

function chooseAlerts(
  kind: InsightKind,
  alerts: DatasurfrAlert[],
  prioritizedAlertIds: string[],
  strictManualSelection = false,
): { selected: DatasurfrAlert[]; shortlist: DatasurfrAlert[]; matchedCount: number } {
  const maxAlerts = kind === 'security' ? MAX_SECURITY_PRIORITY_ALERTS : MAX_BUSINESS_ALERTS
  const shortlistLimit = kind === 'security' ? 180 : 220
  const uniqueAlerts = dedupeAlerts(alerts)
  const prioritizedSet = new Set(prioritizedAlertIds.filter(Boolean))
  const prioritizedAlerts = uniqueAlerts.filter((item) => prioritizedSet.has(item.id))
  if (strictManualSelection) {
    return {
      selected: prioritizedAlerts,
      shortlist: prioritizedAlerts,
      matchedCount: prioritizedAlerts.length,
    }
  }
  return {
    selected: prioritizedAlerts.slice(0, maxAlerts),
    shortlist: prioritizedAlerts.slice(0, Math.min(shortlistLimit, prioritizedAlerts.length)),
    matchedCount: prioritizedAlerts.length,
  }
}

function buildNewsUpdateText(
  config: InsightConfig,
  selected: DatasurfrAlert[],
): string {
  const groups = newsSummaryGroups(selected)
  if (config.key === 'security') {
    const lines: string[] = [
      `${config.title}`,
      `${config.coverageLabel}`,
      '',
      'India',
    ]

    groups.india.forEach((alert, index) => {
      const sourceLinks = insightLinksForAlert(alert)
      const sourceText = sourceLinks.length ? ` (${sourceLinks.join(' | ')})` : ''
      lines.push('', `${index + 1}. [${newsScopeLabel(alert)}] ${alert.event_title}${sourceText}`)
    })

    lines.push('', 'International')
    groups.international.forEach((alert, index) => {
      const sourceLinks = insightLinksForAlert(alert)
      const sourceText = sourceLinks.length ? ` (${sourceLinks.join(' | ')})` : ''
      lines.push('', `${index + 1}. [${newsScopeLabel(alert)}] ${alert.event_title}${sourceText}`)
    })

    return lines.join('\n').trim()
  }

  const lines: string[] = [
    `${config.title}`,
    `${config.coverageLabel}`,
    '',
    'India',
  ]
  groups.india.forEach((alert, index) => {
    const sourceLinks = insightLinksForAlert(alert)
    const sourceText = sourceLinks.length ? ` (${sourceLinks.join(' | ')})` : ''
    lines.push('', `${index + 1}. ${alert.event_title}${sourceText}`)
  })
  lines.push('', 'International')
  groups.international.forEach((alert, index) => {
    const sourceLinks = insightLinksForAlert(alert)
    const sourceText = sourceLinks.length ? ` (${sourceLinks.join(' | ')})` : ''
    lines.push('', `${index + 1}. ${alert.event_title}${sourceText}`)
  })
  return lines.join('\n').trim()
}

async function buildInsightHtml(
  config: InsightConfig,
  selected: DatasurfrAlert[],
  cacheSignature: string,
): Promise<string> {
  const rawIhclLogoUrl = await assetToDataUrl(IHCL_LOGO_SRC)
  const rawOmniLogoUrl = await assetToDataUrl(OMNI_LOGO_SRC)
  const outlookHeaderImageUrl = escapeHtml(await buildOutlookHeaderImageDataUrl(config, rawIhclLogoUrl, rawOmniLogoUrl))
  const ihclLogoUrl = escapeHtml(rawIhclLogoUrl)
  const omniLogoUrl = escapeHtml(rawOmniLogoUrl)
  const renderEventRows = (items: DatasurfrAlert[]) => items.map((alert, index) => {
    const title = escapeHtml(alert.event_title || 'Untitled event')
    const sourceMarkup = insightLinksForAlert(alert).map((link, sourceIndex) => {
      const safeLink = escapeHtml(link)
      const label = insightLinksForAlert(alert).length === 1 ? 'Link' : `Link${sourceIndex + 1}`
      return `<a href="${safeLink}" target="_blank" rel="noopener noreferrer" style="color:#1d4ed8;text-decoration:none;">${label}</a>`
    }).join(' | ')
    return `
          <tr data-insight-alert-id="${escapeHtml(alert.id)}" data-insight-scope="${escapeHtml(newsScopeLabel(alert))}">
            <td width="34" valign="top" style="padding:0 0 16px 0;font-family:Aptos, Arial, Helvetica, sans-serif;font-size:15px;line-height:23px;mso-line-height-rule:exactly;color:#0f172a;">
              ${index + 1}.
            </td>
            <td valign="top" style="padding:0 0 16px 0;font-family:Aptos, Arial, Helvetica, sans-serif;font-size:15px;line-height:23px;mso-line-height-rule:exactly;color:#0f172a;font-weight:600;">
              ${title}${sourceMarkup ? ` <span style="font-weight:400;color:#475569;">(${sourceMarkup})</span>` : ''}
            </td>
          </tr>
    `
  }).join('')
  const summaryGroups = newsSummaryGroups(selected)
  const noRows = '<tr><td colspan="2" style="font-family:Aptos, Arial, Helvetica, sans-serif;font-size:15px;line-height:22px;color:#475569;">No matching events found.</td></tr>'
  const renderSectionHeading = (title: string) => `
          <tr>
            <td colspan="3" style="padding:10px 0 16px 0;font-family:'Segoe UI', Aptos, Arial, Helvetica, sans-serif;font-size:18px;line-height:24px;mso-line-height-rule:exactly;letter-spacing:0.2px;text-transform:none;color:#1e3a5f;font-weight:700;border-bottom:1px solid #d8e3ea;">
              ${escapeHtml(title)}
            </td>
          </tr>
  `
  const renderSectionGap = `
          <tr>
            <td colspan="3" style="height:10px;line-height:10px;font-size:0;">&nbsp;</td>
          </tr>
  `
  const summaryEventItems = config.key === 'security'
    ? [
        ...(summaryGroups.india.length
          ? [
              renderSectionHeading('India'),
              renderSectionGap,
              renderEventRows(summaryGroups.india),
            ]
          : []),
        ...(summaryGroups.international.length
          ? [
              renderSectionHeading('International'),
              renderSectionGap,
              renderEventRows(summaryGroups.international),
            ]
          : []),
      ].join('')
    : [
        ...(summaryGroups.india.length
          ? [
              renderSectionHeading('India'),
              renderSectionGap,
              renderEventRows(summaryGroups.india),
            ]
          : []),
        ...(summaryGroups.international.length
          ? [
              renderSectionHeading('International'),
              renderSectionGap,
              renderEventRows(summaryGroups.international),
            ]
          : []),
      ].join('')

  const emailHeaderHtml = outlookHeaderImageUrl
    ? `<img src="${outlookHeaderImageUrl}" alt="${escapeHtml(config.title)} - ${escapeHtml(config.coverageLabel)}" width="740" height="206" style="display:block;width:740px;height:206px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;background-color:#123653;" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="740" style="width:740px;background-color:#123653;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                <tr>
                  <td valign="top" style="padding:20px 30px 0 30px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" style="width:680px;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                      <tr>
                        <td align="left" valign="top" width="340" style="width:340px;font-size:0;line-height:normal;mso-line-height-rule:exactly;">
                          <img src="${ihclLogoUrl}" alt="IHCL Logo" width="114" style="display:block;width:114px;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
                        </td>
                        <td align="right" valign="top" width="340" style="width:340px;font-size:0;line-height:normal;mso-line-height-rule:exactly;">
                          <img src="${omniLogoUrl}" alt="Omni Logo" width="107" style="display:block;width:107px;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td height="18" style="height:18px;font-size:0;line-height:18px;mso-line-height-rule:exactly;">&nbsp;</td>
                </tr>
                <tr>
                  <td align="center" valign="top" style="padding:0 30px;font-family:Aptos, Arial, Helvetica, sans-serif;font-size:32px;line-height:38px;mso-line-height-rule:exactly;font-weight:bold;color:#ffffff;">
                    ${escapeHtml(config.title)}
                  </td>
                </tr>
                <tr>
                  <td align="center" valign="top" style="padding:10px 30px 30px 30px;font-family:Aptos, Arial, Helvetica, sans-serif;font-size:17px;line-height:23px;mso-line-height-rule:exactly;font-weight:bold;color:#ffffff;">
                    ${escapeHtml(config.coverageLabel)}
                  </td>
                </tr>
              </table>`

  return `<!-- ${INSIGHTS_TEMPLATE_VERSION} -->
<!-- ${escapeHtml(cacheSignature)} -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(config.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef4f8;font-family:Aptos, Arial, Helvetica, sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eef4f8;margin:0;padding:24px 12px;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="740" style="width:100%;max-width:740px;background-color:#ffffff;border-collapse:separate;border-spacing:0;border:1px solid #d8e3ea;border-radius:16px;overflow:hidden;mso-table-lspace:0pt;mso-table-rspace:0pt;">
          <tr>
            <td style="padding:0;background-color:#123653;border-bottom:0;">
              ${emailHeaderHtml}
            </td>
          </tr>

          <tr>
            <td style="padding:28px 30px 6px 30px;background-color:#ffffff;">
              <div style="font-family:'Segoe UI', Aptos, Arial, Helvetica, sans-serif;font-size:16px;line-height:22px;mso-line-height-rule:exactly;letter-spacing:0.3px;text-transform:none;color:#415a77;font-weight:700;">
                ${''}
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:12px 30px 18px 30px;background-color:#ffffff;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                ${summaryEventItems || noRows}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:10px 30px 12px 30px;border-top:2px solid #071426;background-color:#f5f7fb;">
              <div style="font-family:Arial, Helvetica, sans-serif;font-size:13px;line-height:17px;mso-line-height-rule:exactly;color:#4b5563;">
                Regards,<br />
                <strong style="display:inline-block;padding-top:1px;font-size:15px;line-height:17px;mso-line-height-rule:exactly;color:#071426;letter-spacing:.4px;">S&amp;S IHCL</strong>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export default function SendInsightsPage() {
  const { data: rawSettings } = useSettings()
  const azureOpenAiPayload = useMemo(() => buildAzureOpenAiPayload(rawSettings), [rawSettings])
  const { sendInsightsGuideLaunchNonce } = useOutletContext<{
    sendInsightsGuideLaunchNonce: number
  }>()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const shortlistScope = user ? `${user.id}:${user.email}` : null
  const [externalFeedLookbackDays] = useState(() => loadExternalFeedLookbackDays())
  const externalBusinessQuery = useQuery({
    queryKey: ['send-insights-external-news', 'business', externalFeedLookbackDays],
    queryFn: () => externalNewsApi.listInsightsNews('business', EXTERNAL_BUSINESS_LIMIT, externalFeedLookbackDays),
    staleTime: SESSION_QUERY_STALE_TIME,
    gcTime: SESSION_QUERY_STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
  const externalSecurityQuery = useQuery({
    queryKey: ['send-insights-external-news', 'security', externalFeedLookbackDays],
    queryFn: () => externalNewsApi.listInsightsNews('security', EXTERNAL_SECURITY_LIMIT, externalFeedLookbackDays),
    staleTime: SESSION_QUERY_STALE_TIME,
    gcTime: SESSION_QUERY_STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
  const { data: emailGroups = [] } = useQuery({
    queryKey: ['email-groups-send-insights'],
    queryFn: () => emailGroupsApi.list(true),
  })
  const { data: superadmins = [] } = useQuery({
    queryKey: ['approval-superadmins-send-insights'],
    queryFn: approvalsApi.listSuperadmins,
  })
  const { data: mapProperties = [] } = useQuery({
    queryKey: ['map-view-properties'],
    queryFn: () => datasurfrApi.listMapProperties(),
    staleTime: 5 * 60 * 1000,
  })
  const { data: notificationsPage } = useQuery({
    queryKey: ['send-insights-notifications'],
    queryFn: () => notificationsApi.list({ page: 1, page_size: 100 }),
  })
  const isExternalFeedLoading =
    externalBusinessQuery.isLoading
    || externalSecurityQuery.isLoading
    || externalBusinessQuery.isFetching
    || externalSecurityQuery.isFetching
  const now = useMemo(() => new Date(), [])
  const businessCoverageLabel = useMemo(
    () => formatCoverageRangeFromCandidates(externalBusinessQuery.data?.items || [], now),
    [externalBusinessQuery.data, now],
  )
  const securityCoverageLabel = useMemo(
    () => formatCoverageRangeFromCandidates(externalSecurityQuery.data?.items || [], now),
    [externalSecurityQuery.data, now],
  )

  const insightConfigs = useMemo<Record<InsightKind, InsightConfig>>(
    () => ({
      business: {
        key: 'business',
        title: 'Daily Business Insights',
        scheduleLabel: 'Morning run | business-impact coverage',
        headingPrefix: 'Daily Business Insights',
        coverageLabel: businessCoverageLabel,
      },
      security: {
        key: 'security',
        title: 'Daily News Summary',
        scheduleLabel: 'Night run | current operational picture',
        headingPrefix: 'Daily Safety and Security News Updates',
        coverageLabel: securityCoverageLabel,
      },
    }),
    [businessCoverageLabel, securityCoverageLabel],
  )

  const [cards, setCards] = useState<Record<InsightKind, InsightCardState>>({
    business: {
      generating: false,
      error: null,
      viewMode: 'template',
      notification: null,
      selected: [],
    },
    security: {
      generating: false,
      error: null,
      viewMode: 'template',
      notification: null,
      selected: [],
    },
  })
  const [recipientEmail, setRecipientEmail] = useState('')
  const [recipientSearchFocused, setRecipientSearchFocused] = useState(false)
  const [emailGroupMenuOpen, setEmailGroupMenuOpen] = useState(false)
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([])
  const [selectedApproverUserId, setSelectedApproverUserId] = useState<number | ''>('')
  const [sendingTarget, setSendingTarget] = useState<InsightKind | 'both' | null>(null)
  const [sendFeedback, setSendFeedback] = useState<string | null>(null)
  const handoffHandledRef = useRef(false)
  const guideDoneTimeoutRef = useRef<number | null>(null)
  const [isGuideActive, setIsGuideActive] = useState(false)
  const [guideStepIndex, setGuideStepIndex] = useState(0)
  const [guidePopoverPosition, setGuidePopoverPosition] = useState({ top: 84, left: 20 })
  const [showGuideDoneMessage, setShowGuideDoneMessage] = useState(false)
  const activeGuideStep = isGuideActive ? SEND_INSIGHTS_GUIDE_STEPS[guideStepIndex] : null
  const allPropertyEmailSuggestions = useMemo(
    () => uniqueEmailSuggestions(mapProperties.flatMap((property) => propertyEmailSuggestions(property))),
    [mapProperties],
  )
  const filteredRecipientSuggestions = useMemo(() => {
    const query = recipientEmail.trim().toLowerCase()
    if (!query) return allPropertyEmailSuggestions.slice(0, 10)
    return allPropertyEmailSuggestions
      .filter((item) => item.searchText.toLowerCase().includes(query))
      .slice(0, 10)
  }, [allPropertyEmailSuggestions, recipientEmail])
  const shouldShowRecipientSuggestions =
    recipientSearchFocused
    && selectedGroupIds.length === 0
    && filteredRecipientSuggestions.length > 0
  const selectRecipientSuggestion = (email: string) => {
    setRecipientEmail(email)
    setSelectedGroupIds([])
    setRecipientSearchFocused(false)
  }

  const patchSendInsightsNotificationCache = useCallback((updated: Notification) => {
    queryClient.setQueryData<{ items?: Notification[] } | undefined>(['send-insights-notifications'], (current) => {
      const items = current?.items || []
      const index = items.findIndex((item) => item.id === updated.id)
      if (index === -1) {
        return { ...current, items: [updated, ...items] }
      }
      const nextItems = [...items]
      nextItems[index] = updated
      return { ...current, items: nextItems }
    })
  }, [queryClient])

  const latestInsightNotifications = useMemo(() => {
    const items = notificationsPage?.items || []
    const latestByKind: Partial<Record<InsightKind, Notification>> = {}
    ;(['business', 'security'] as InsightKind[]).forEach((kind) => {
      const incidentType = insightIncidentType(kind).toLowerCase()
      const headingPrefix = insightConfigs[kind].headingPrefix.toLowerCase()
      const matches = items.filter((item) => {
        const itemIncident = String(item.incident_type || '').trim().toLowerCase()
        const itemHeading = String(item.heading || '').trim().toLowerCase()
        return itemIncident === incidentType || itemHeading.includes(headingPrefix)
      })
      matches.sort((a, b) => {
        const aTs = apiTime(a.updated_at || a.created_at)
        const bTs = apiTime(b.updated_at || b.created_at)
        return bTs - aTs
      })
      if (matches[0]) {
        latestByKind[kind] = matches[0]
      }
    })
    return latestByKind
  }, [insightConfigs, notificationsPage?.items])

  useEffect(() => {
    if (!latestInsightNotifications.business && !latestInsightNotifications.security) return
    setCards((prev) => {
      let changed = false
      const next = { ...prev }
      ;(['business', 'security'] as InsightKind[]).forEach((kind) => {
        const latest = latestInsightNotifications[kind]
        if (!latest || prev[kind].notification?.id === latest.id) return
        changed = true
        next[kind] = {
          ...prev[kind],
          notification: latest,
        }
      })
      return changed ? next : prev
    })
  }, [latestInsightNotifications])

  const generateInsight = useCallback(
    async (kind: InsightKind, forceRegenerate = false, injectedCandidates?: ExternalNewsCandidate[]) => {
      const config = insightConfigs[kind]
      const autoBusinessMode = kind === 'business' && forceRegenerate && !injectedCandidates
      const autoSecurityMode = kind === 'security' && forceRegenerate && !injectedCandidates
      const strictManualSelection = !autoBusinessMode && !autoSecurityMode
      const businessAutoPool = autoBusinessMode
        ? topCandidatesPerCategory(externalBusinessQuery.data?.items || [], BUSINESS_AUTO_CATEGORY_LABELS, 6)
        : null
      const securityAutoPool = autoSecurityMode
        ? topCandidatesPerCategory(externalSecurityQuery.data?.items || [], SUMMARY_AUTO_CATEGORY_LABELS, 6)
        : null
      const externalCandidatePool = injectedCandidates
        ? injectedCandidates
        : kind === 'business'
          ? (businessAutoPool || externalBusinessQuery.data?.items || [])
          : (securityAutoPool || externalSecurityQuery.data?.items || [])
      const externalAlerts = externalCandidatePool.map(externalCandidateToAlert)
      const alerts = externalAlerts
      const shortlistState = loadExternalShortlist(shortlistScope)
      const prioritizedAlertIds = (autoBusinessMode || autoSecurityMode)
        ? externalAlerts.map((item) => item.id)
        : kind === 'business'
          ? shortlistState.business
          : shortlistState.security
      if (isExternalFeedLoading) {
        setCards((prev) => ({
          ...prev,
          [kind]: {
            ...prev[kind],
            generating: false,
            error: 'Loading external feed...',
          },
        }))
        return
      }
      if (!alerts.length) {
        setCards((prev) => ({
          ...prev,
          [kind]: {
            ...prev[kind],
            generating: false,
            error: 'No feed alerts available to build this insight.',
          },
        }))
        return
      }
      if (!prioritizedAlertIds.length) {
        setCards((prev) => ({
          ...prev,
          [kind]: {
            ...prev[kind],
            generating: false,
            error: 'Select news items from external feed.',
            notification: null,
            selected: [],
          },
        }))
        return
      }

      setCards((prev) => ({
        ...prev,
        [kind]: { ...prev[kind], generating: true, error: null },
      }))

      try {
        const heading = `${config.headingPrefix} | ${config.coverageLabel}`
        const cacheSignature = buildInsightCacheSignature(kind)

        if (!forceRegenerate) void forceRegenerate

        const { selected: fallbackSelected, shortlist } = chooseAlerts(
          kind,
          alerts,
          prioritizedAlertIds,
          strictManualSelection,
        )
        if (!fallbackSelected.length) {
          setCards((prev) => ({
            ...prev,
            [kind]: {
              ...prev[kind],
              generating: false,
              error: 'Select news items from external feed.',
              notification: null,
              selected: [],
            },
          }))
          return
        }
        let selected: DatasurfrAlert[] = fallbackSelected
        if (!strictManualSelection) {
          const maxItems = kind === 'security'
            ? MAX_SECURITY_PRIORITY_ALERTS
            : Math.max(1, Math.min(shortlist.length || fallbackSelected.length, 220))
          const curation = await curateAlertsWithLlm(
            kind,
            config,
            shortlist.slice(0, 320),
            fallbackSelected,
            maxItems,
            azureOpenAiPayload,
          )
          selected = curation.selected
        }
        const updatesText = buildNewsUpdateText(config, selected)
        const insightHtml = await buildInsightHtml(config, selected, cacheSignature)
        const created = await notificationsApi.create({
          heading,
          email_subject: heading,
          incident_type: insightIncidentType(kind),
          source_text: updatesText,
          generated_text: updatesText,
        })
        const updated = await notificationsApi.update(
          created.id,
          {
            incident_type: insightIncidentType(kind),
            generated_text: updatesText,
            channel_email_text: insightHtml,
          },
        )

        patchSendInsightsNotificationCache(updated)
        setCards((prev) => ({
          ...prev,
          [kind]: {
            ...prev[kind],
            generating: false,
            error: null,
            notification: updated,
            selected,
          },
        }))
        void queryClient.invalidateQueries({ queryKey: ['notifications'] })
        void queryClient.invalidateQueries({ queryKey: ['send-insights-notifications'] })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate insight.'
        setCards((prev) => ({
          ...prev,
          [kind]: {
            ...prev[kind],
            generating: false,
            error: message,
          },
        }))
      }
    },
    [externalBusinessQuery.data, externalSecurityQuery.data, insightConfigs, isExternalFeedLoading, patchSendInsightsNotificationCache, queryClient, shortlistScope],
  )

  const updateInsightSelection = useCallback(
    async (kind: InsightKind, nextSelected: DatasurfrAlert[]) => {
      const card = cards[kind]
      const notification = card.notification
      if (!notification) {
        setCards((prev) => ({
          ...prev,
          [kind]: { ...prev[kind], selected: nextSelected },
        }))
        return
      }

      const config = insightConfigs[kind]
      const cacheSignature = buildInsightCacheSignature(kind)
      setCards((prev) => ({
        ...prev,
        [kind]: { ...prev[kind], generating: true, error: null },
      }))

      try {
        const updatesText = buildNewsUpdateText(config, nextSelected)
        const insightHtml = await buildInsightHtml(config, nextSelected, cacheSignature)
        const updated = await notificationsApi.update(notification.id, {
          generated_text: updatesText,
          channel_email_text: insightHtml,
        })
        patchSendInsightsNotificationCache(updated)
        setCards((prev) => ({
          ...prev,
          [kind]: {
            ...prev[kind],
            generating: false,
            error: null,
            notification: updated,
            selected: nextSelected,
          },
        }))
        void queryClient.invalidateQueries({ queryKey: ['notifications'] })
        void queryClient.invalidateQueries({ queryKey: ['send-insights-notifications'] })
      } catch (error) {
        setCards((prev) => ({
          ...prev,
          [kind]: {
            ...prev[kind],
            generating: false,
            error: error instanceof Error ? error.message : 'Unable to update insight preview.',
          },
        }))
      }
    },
    [cards, insightConfigs, patchSendInsightsNotificationCache, queryClient],
  )

  const removeInsightItem = useCallback(
    (kind: InsightKind, alertId: string) => {
      const nextSelected = cards[kind].selected.filter((alert) => alert.id !== alertId)
      void updateInsightSelection(kind, nextSelected)
    },
    [cards, updateInsightSelection],
  )

  const toggleInsightScope = useCallback(
    (kind: InsightKind, alertId: string) => {
      const nextSelected = cards[kind].selected.map((alert) => {
        if (alert.id !== alertId) return alert
        return setNewsScope(alert, isInternationalNewsAlert(alert) ? 'India' : 'International')
      })
      void updateInsightSelection(kind, nextSelected)
    },
    [cards, updateInsightSelection],
  )

  useEffect(() => {
    const handlePreviewMessage = (event: MessageEvent) => {
      const payload = event.data
      if (!payload || payload.source !== 'raven-send-insights-preview') return
      if (payload.kind !== 'business' && payload.kind !== 'security') return
      const alertId = String(payload.alertId || '')
      if (!alertId) return
      if (payload.action === 'remove') {
        removeInsightItem(payload.kind, alertId)
      }
      if (payload.action === 'toggle-scope') {
        toggleInsightScope(payload.kind, alertId)
      }
    }
    window.addEventListener('message', handlePreviewMessage)
    return () => window.removeEventListener('message', handlePreviewMessage)
  }, [removeInsightItem, toggleInsightScope])

  useEffect(() => {
    if (handoffHandledRef.current) return
    if (externalBusinessQuery.isLoading || externalSecurityQuery.isLoading) return
    handoffHandledRef.current = true
    const handoff = consumeShortlistHandoff(shortlistScope)
    if (!handoff) return
    if (handoff.target === 'business') {
      void generateInsight('business', true, handoff.selected_business)
      return
    }
    if (handoff.target === 'security') {
      void generateInsight('security', true, handoff.selected_security)
      return
    }
    void Promise.all([
      generateInsight('business', true, handoff.selected_business),
      generateInsight('security', true, handoff.selected_security),
    ])
  }, [
    externalBusinessQuery.isLoading,
    externalSecurityQuery.isLoading,
    generateInsight,
    shortlistScope,
  ])

  const finishGuide = useCallback(() => {
    setIsGuideActive(false)
    setGuideStepIndex(0)
    setShowGuideDoneMessage(true)
    if (guideDoneTimeoutRef.current) {
      window.clearTimeout(guideDoneTimeoutRef.current)
    }
    guideDoneTimeoutRef.current = window.setTimeout(() => {
      setShowGuideDoneMessage(false)
    }, 2200)
  }, [])

  useEffect(() => {
    return () => {
      if (guideDoneTimeoutRef.current) {
        window.clearTimeout(guideDoneTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!sendInsightsGuideLaunchNonce) return
    setShowGuideDoneMessage(false)
    setGuideStepIndex(0)
    setIsGuideActive(true)
  }, [sendInsightsGuideLaunchNonce])

  useEffect(() => {
    if (!activeGuideStep) return
    const targetElement = document.getElementById(activeGuideStep.targetId)
    if (!targetElement) return

    const positionPopover = () => {
      const targetRect = targetElement.getBoundingClientRect()
      const popoverWidth = 350
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const margin = 16
      const topbar = document.querySelector('.app-topbar')
      const topbarBottom = topbar ? topbar.getBoundingClientRect().bottom : 0
      const scrollY = window.scrollY
      const scrollX = window.scrollX

      let left = targetRect.left + scrollX
      if (left + popoverWidth > scrollX + viewportWidth - margin) {
        left = scrollX + viewportWidth - popoverWidth - margin
      }
      if (left < scrollX + margin) left = scrollX + margin

      let top = targetRect.bottom + scrollY + 12
      if (top + 280 > scrollY + viewportHeight - margin) {
        top = targetRect.top + scrollY - 300
      }
      const minTop = Math.max(topbarBottom + scrollY + 10, scrollY + margin)
      if (top < minTop) {
        top = minTop
      }

      setGuidePopoverPosition({ top, left })
    }

    positionPopover()
    window.addEventListener('resize', positionPopover)
    window.addEventListener('scroll', positionPopover, true)
    return () => {
      window.removeEventListener('resize', positionPopover)
      window.removeEventListener('scroll', positionPopover, true)
    }
  }, [activeGuideStep])

  useEffect(() => {
    const topbar = document.getElementById('dashboard-guide-topbar')
    if (!topbar) return
    const shouldHighlight = isGuideActive && activeGuideStep?.key === 'top-nav'
    topbar.classList.toggle('dashboard-guide-topbar-active', shouldHighlight)
    return () => {
      topbar.classList.remove('dashboard-guide-topbar-active')
    }
  }, [activeGuideStep?.key, isGuideActive])

  useEffect(() => {
    if (!isGuideActive) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setGuideStepIndex((current) => Math.max(0, current - 1))
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setGuideStepIndex((current) => {
          if (current >= SEND_INSIGHTS_GUIDE_STEPS.length - 1) {
            finishGuide()
            return current
          }
          return current + 1
        })
      } else if (event.key === 'Escape') {
        event.preventDefault()
        setIsGuideActive(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [finishGuide, isGuideActive])

  const handleGuideNext = useCallback(() => {
    setGuideStepIndex((current) => {
      if (current >= SEND_INSIGHTS_GUIDE_STEPS.length - 1) {
        finishGuide()
        return current
      }
      return current + 1
    })
  }, [finishGuide])

  const handleGuidePrevious = useCallback(() => {
    setGuideStepIndex((current) => Math.max(0, current - 1))
  }, [])

  const guideClassFor = useCallback((stepKey: string) => {
    if (!isGuideActive || !activeGuideStep) return ''
    return ` insights-guide-target${activeGuideStep.key === stepKey ? ' is-active' : ' is-dimmed'}`
  }, [activeGuideStep, isGuideActive])

  const sendViaEmail = async (target: InsightKind | 'both') => {
    if (selectedGroupIds.length > 0) {
      await sendViaEmailGroup(selectedGroupIds, target)
      return
    }
    const destination = recipientEmail.trim()
    if (!destination) {
      setSendFeedback('Enter a recipient email address.')
      return
    }
    if (!selectedApproverUserId) {
      setSendFeedback('Select the superadmin approver before sending insights for approval.')
      return
    }

    const kinds: InsightKind[] = target === 'both' ? ['business', 'security'] : [target]
    for (const kind of kinds) {
      const notification = cards[kind].notification
      if (!notification) {
        setSendFeedback(`Generate ${insightConfigs[kind].title.toLowerCase()} first.`)
        return
      }
      if (!extractWorkingText(notification)) {
        setSendFeedback(`No update content found for ${insightConfigs[kind].title.toLowerCase()}.`)
        return
      }
    }

    setSendingTarget(target)
    setSendFeedback(null)
    try {
      await Promise.all(kinds.map(async (kind) => {
        const notification = cards[kind].notification as Notification
        await approvalsApi.create({
          notification_id: notification.id,
          item_type: 'insight',
          approver_user_id: Number(selectedApproverUserId),
          title: notification.heading || notification.email_subject || insightConfigs[kind].title,
          subject: notification.email_subject || notification.heading || insightConfigs[kind].headingPrefix,
          message_text: extractWorkingText(notification),
          recipient_emails: [destination],
          recipient_group_ids: [],
        })
      }))
      void queryClient.invalidateQueries({ queryKey: ['approvals'] })
      setSendFeedback(
        target === 'both'
          ? `Both insights sent for approval for ${destination}.`
          : `${insightConfigs[target].title} sent for approval for ${destination}.`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send email.'
      setSendFeedback(message)
    } finally {
      setSendingTarget(null)
    }
  }

  const sendViaEmailGroup = async (groupIds: number[], target: InsightKind | 'both') => {
    const selectedGroups = emailGroups.filter((item) => groupIds.includes(item.id))
    if (!selectedGroups.length) return
    const uniqueByLower = new Map<string, string>()
    for (const destination of selectedGroups.flatMap((group) =>
      (group.members || [])
        .filter((member) => member.active)
        .map((member) => String(member.email || '').trim())
        .filter(Boolean),
    )) {
      const key = destination.toLowerCase()
      if (!uniqueByLower.has(key)) {
        uniqueByLower.set(key, destination)
      }
    }
    const destinations = Array.from(uniqueByLower.values())
    if (!destinations.length) {
      setSendFeedback('No active emails found in selected groups.')
      return
    }
    if (!selectedApproverUserId) {
      setSendFeedback('Select the superadmin approver before sending insights for approval.')
      return
    }

    const kinds: InsightKind[] = target === 'both' ? ['business', 'security'] : [target]
    for (const kind of kinds) {
      const notification = cards[kind].notification
      if (!notification) {
        setSendFeedback(`Generate ${insightConfigs[kind].title.toLowerCase()} first.`)
        return
      }
      if (!extractWorkingText(notification)) {
        setSendFeedback(`No update content found for ${insightConfigs[kind].title.toLowerCase()}.`)
        return
      }
    }

    setSendingTarget(target)
    setSendFeedback(null)
    setEmailGroupMenuOpen(false)
    try {
      await Promise.all(kinds.map(async (kind) => {
        const notification = cards[kind].notification as Notification
        await approvalsApi.create({
          notification_id: notification.id,
          item_type: 'insight',
          approver_user_id: Number(selectedApproverUserId),
          title: notification.heading || notification.email_subject || insightConfigs[kind].title,
          subject: notification.email_subject || notification.heading || insightConfigs[kind].headingPrefix,
          message_text: extractWorkingText(notification),
          recipient_emails: [],
          recipient_group_ids: groupIds,
        })
      }))
      void queryClient.invalidateQueries({ queryKey: ['approvals'] })
      setSendFeedback(
        target === 'both'
          ? `Both insights sent for approval to ${selectedGroups.length} group(s) (${destinations.length} recipients).`
          : `${insightConfigs[target].title} sent for approval to ${selectedGroups.length} group(s) (${destinations.length} recipients).`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send email.'
      setSendFeedback(message)
    } finally {
      setSendingTarget(null)
    }
  }

  const selectedGroupNames = useMemo(
    () => emailGroups.filter((group) => selectedGroupIds.includes(group.id)).map((group) => group.name),
    [emailGroups, selectedGroupIds],
  )
  const previewDocs = useMemo<Record<InsightKind, string>>(
    () => ({
      business: buildPreviewDoc(cards.business.notification?.channel_email_text || '', 'business'),
      security: buildPreviewDoc(cards.security.notification?.channel_email_text || '', 'security'),
    }),
    [
      cards.business.notification?.channel_email_text,
      cards.security.notification?.channel_email_text,
    ],
  )
  const isLightTheme = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light'
  const menuSurfaceBg = isLightTheme ? '#ffffff' : '#0f172a'
  const menuBorder = isLightTheme ? '#cbd5e1' : '#334155'
  const rowDefaultBg = isLightTheme ? '#f3f4f6' : '#1f2937'
  const rowDefaultText = isLightTheme ? '#111827' : '#e5e7eb'

  const downloadInsight = (kind: InsightKind) => {
    const notification = cards[kind].notification
    const html = String(notification?.channel_email_text || '').trim()
    if (!html) {
      setSendFeedback(`No template available to download for ${insightConfigs[kind].title.toLowerCase()}.`)
      return
    }

    const fileDate = insightConfigs[kind].coverageLabel.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '')
    const fileName = `${kind}_news_update_${fileDate || 'export'}.html`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className={`compose-page insights-page${isGuideActive ? ' is-guide-active' : ''}`}>
      <section id="send-insights-guide-mail" className={`insights-mail-panel${guideClassFor('mail-controls')}`}>
        <div className="insights-mail-actions">
          <div className="insights-recipient-control">
            <div className="insights-recipient-search">
              <input
                value={recipientEmail}
                onChange={(event) => {
                  setRecipientEmail(event.target.value)
                  setSelectedGroupIds([])
                  setRecipientSearchFocused(true)
                }}
                onFocus={() => setRecipientSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setRecipientSearchFocused(false), 140)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && filteredRecipientSuggestions[0]) {
                    event.preventDefault()
                    selectRecipientSuggestion(filteredRecipientSuggestions[0].email)
                  } else if (event.key === 'Escape') {
                    setRecipientSearchFocused(false)
                  }
                }}
                placeholder="Search/add SMTP email by email, name, or property"
                className="insights-email-input"
                aria-label="Search SMTP recipient by email, name, or property"
                aria-expanded={shouldShowRecipientSuggestions}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                name="raven-send-insights-smtp-recipient"
              />
              {shouldShowRecipientSuggestions ? (
                <div className="insights-recipient-suggestions" role="listbox">
                  {filteredRecipientSuggestions.map((item) => (
                    <button
                      key={`${normalizeEmail(item.email)}-${item.label}`}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectRecipientSuggestion(item.email)}
                      disabled={sendingTarget !== null}
                      role="option"
                    >
                      <span>{item.email}</span>
                      <small>{item.label}</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEmailGroupMenuOpen((open) => !open)}
              disabled={sendingTarget !== null}
              title="Send to email group"
              aria-label="Send to email group"
            >
              <Users size={14} />
            </button>
            {emailGroupMenuOpen ? (
              <div style={{ position: 'absolute', top: '110%', right: 0, minWidth: 260, background: menuSurfaceBg, border: `1px solid ${menuBorder}`, borderRadius: 8, zIndex: 20, maxHeight: 220, overflow: 'auto', boxShadow: '0 8px 20px rgba(15,23,42,0.25)' }}>
                {emailGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      border: 0,
                      borderRadius: 0,
                      padding: '9px 10px',
                      cursor: 'pointer',
                      backgroundColor: selectedGroupIds.includes(group.id) ? '#b7ddc7' : rowDefaultBg,
                      color: selectedGroupIds.includes(group.id) ? '#166534' : rowDefaultText,
                      fontWeight: selectedGroupIds.includes(group.id) ? 700 : 500,
                    }}
                    onClick={() => {
                      setSelectedGroupIds((prev) =>
                        prev.includes(group.id) ? prev.filter((id) => id !== group.id) : [...prev, group.id],
                      )
                      setRecipientEmail('')
                    }}
                  >
                    {group.name}
                  </button>
                ))}
                {emailGroups.length === 0 ? (
                  <div style={{ padding: 8, fontSize: 12, color: '#64748b' }}>No email groups found</div>
                ) : null}
              </div>
            ) : null}
          </div>
          <select
            className="approval-approver-select insights-approver-select"
            value={selectedApproverUserId}
            onChange={(event) => setSelectedApproverUserId(event.target.value ? Number(event.target.value) : '')}
            disabled={sendingTarget !== null}
            aria-label="Select superadmin approver"
          >
            <option value="">Approver</option>
            {superadmins.map((item) => (
              <option key={item.id} value={item.id}>{item.email}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primary"
            onClick={() => { void sendViaEmail('business') }}
            disabled={sendingTarget !== null}
          >
            <Send size={14} />
            {sendingTarget === 'business' ? 'Requesting...' : 'Insights'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => { void sendViaEmail('security') }}
            disabled={sendingTarget !== null}
          >
            <Send size={14} />
            {sendingTarget === 'security' ? 'Requesting...' : 'Summary'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => { void sendViaEmail('both') }}
            disabled={sendingTarget !== null}
          >
            <Send size={14} />
            {sendingTarget === 'both' ? 'Requesting...' : 'Both'}
          </button>
        </div>

        {sendFeedback ? <div className="compose-meta-note">{sendFeedback}</div> : null}
        {isExternalFeedLoading ? <div className="compose-meta-note">Loading external feed...</div> : null}
        {selectedGroupNames.length > 0 ? <div className="compose-meta-note">Selected groups: {selectedGroupNames.join(', ')}</div> : null}
      </section>

      <div className="insights-grid">
        {(['business', 'security'] as const).map((kind) => {
          const config = insightConfigs[kind]
          const card = cards[kind]
          const outputText = card.notification ? extractWorkingText(card.notification) : ''

          return (
            <section
              key={config.key}
              id={kind === 'business' ? 'send-insights-guide-business' : 'send-insights-guide-security'}
              className={`insights-card${guideClassFor(kind === 'business' ? 'business-card' : 'security-card')}`}
            >
              <div className="insights-card-head">
                <h3>{config.title}</h3>
                <div className="insights-card-head-meta">
                  <span className="insights-coverage-text">{config.coverageLabel}</span>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => { void generateInsight(kind, true) }}
                    disabled={card.generating || isExternalFeedLoading}
                    title={`Auto-generate ${config.title}`}
                    aria-label={`Auto-generate ${config.title}`}
                  >
                    {card.generating ? 'Generating...' : 'Auto-generate'}
                  </button>
                </div>
              </div>

              <div className="insights-card-actions">
                <div className="insights-card-button-row">
                  <button
                    type="button"
                    className="btn-primary insights-icon-btn"
                    onClick={() => { void generateInsight(kind, true) }}
                    disabled={card.generating || isExternalFeedLoading}
                    title="Refresh updates"
                    aria-label={`Refresh ${config.title}`}
                  >
                    {card.generating ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary insights-icon-btn"
                    onClick={() => downloadInsight(kind)}
                    disabled={!card.notification}
                    title="Download update"
                    aria-label={`Download ${config.title}`}
                  >
                    <Download size={14} />
                  </button>
                </div>
                <div
                  id={kind === 'business' ? 'send-insights-guide-view-controls' : undefined}
                  className={`insights-view-controls${kind === 'business' ? guideClassFor('view-modes') : ''}`}
                >
                  <div className="compose-pill-tabs">
                    <button
                      type="button"
                      className={`compose-pill${card.viewMode === 'template' ? ' is-active' : ''}`}
                      onClick={() => {
                        setCards((prev) => ({
                          ...prev,
                          [kind]: { ...prev[kind], viewMode: 'template' },
                        }))
                      }}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      className={`compose-pill${card.viewMode === 'text' ? ' is-active' : ''}`}
                      onClick={() => {
                        setCards((prev) => ({
                          ...prev,
                          [kind]: { ...prev[kind], viewMode: 'text' },
                        }))
                      }}
                    >
                      Text
                    </button>
                  </div>
                </div>
              </div>

              {card.error ? <div className="compose-alert-error">{card.error}</div> : null}

              <div className="compose-label-stack">
                {card.viewMode === 'template' ? (
                  card.generating && !card.notification ? (
                    <div className="insights-preview-loading" role="status" aria-live="polite">
                      <span className="insights-loading-ring" aria-hidden="true" />
                      <span>Generating preview...</span>
                    </div>
                  ) : (
                    <iframe
                      title={`${config.title} preview`}
                      srcDoc={previewDocs[kind]}
                      className="insights-preview-frame"
                      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                      referrerPolicy="no-referrer"
                    />
                  )
                ) : (
                  <textarea
                    className="compose-text-output insights-output-box raven-dark-scroll"
                    value={outputText}
                    readOnly
                    placeholder="Updates will appear here once prepared."
                  />
                )}
              </div>
            </section>
          )
        })}
      </div>
      {isGuideActive && activeGuideStep ? (
        <div
          className="insights-guide-popover"
          style={{ top: `${guidePopoverPosition.top}px`, left: `${guidePopoverPosition.left}px` }}
          role="dialog"
          aria-modal="false"
          aria-label="Send insights guide"
        >
          <div className="insights-guide-progress">
            Step {guideStepIndex + 1} of {SEND_INSIGHTS_GUIDE_STEPS.length}
          </div>
          <button
            type="button"
            className="insights-guide-close-btn btn-danger-action"
            onClick={() => setIsGuideActive(false)}
            aria-label="Close guide"
            title="Close guide"
          >
            <X size={16} />
          </button>
          <h4>{activeGuideStep.title}</h4>
          <p>{activeGuideStep.description}</p>
          <ul className="insights-guide-points">
            {activeGuideStep.points.map((point, idx) => (
              <li key={`${activeGuideStep.key}-point-${idx}`}>{point}</li>
            ))}
          </ul>
          <div className="insights-guide-controls">
            <button
              type="button"
              className="insights-guide-arrow insights-guide-arrow--prev"
              onClick={handleGuidePrevious}
              disabled={guideStepIndex === 0}
              aria-label="Previous step"
              title="Previous"
            >
              Previous
            </button>
            <button
              type="button"
              className="insights-guide-arrow insights-guide-arrow--next"
              onClick={handleGuideNext}
              aria-label={guideStepIndex === SEND_INSIGHTS_GUIDE_STEPS.length - 1 ? 'Finish guide' : 'Next step'}
              title={guideStepIndex === SEND_INSIGHTS_GUIDE_STEPS.length - 1 ? 'Finish' : 'Next'}
            >
              {guideStepIndex === SEND_INSIGHTS_GUIDE_STEPS.length - 1 ? 'Finish' : <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      ) : null}
      {showGuideDoneMessage ? (
        <div className="insights-guide-done" role="status" aria-live="polite">
          Send Insights guide completed.
        </div>
      ) : null}
    </section>
  )
}
