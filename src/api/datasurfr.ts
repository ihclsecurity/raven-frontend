/**
 * Datasurfr API
 *
 * What this file does
 * -------------------
 * This file wraps the Datasurfr alert, export, map-property, and import
 * endpoints that power the intelligence views.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the list and export calls first, then the import helpers. That order
 * matches the main Datasurfr flows in the UI.
 *
 * When to change this file
 * ------------------------
 * Update this file when the backend changes how feed alerts, map properties, or
 * bulk imports are returned.
 *
 * What this file does not do
 * --------------------------
 * This file does not transform the feed data beyond the HTTP request/response
 * boundary.
 */

import client from './client'
import type {
  DatasurfrAlert,
  DatasurfrEventsSummaryImportResponse,
  DatasurfrImportPayload,
  DatasurfrImportResponse,
  DatasurfrMapProperty,
  DatasurfrRegionSummaryImportPayload,
  DatasurfrRegionSummaryImportResponse,
} from '../types/datasurfr'

export const datasurfrApi = {
  listAlerts: (time = 120) =>
    client.get<DatasurfrAlert[]>('/datasurfr/alerts', { params: { time } }).then((r) => r.data),
  exportFeedExcel: (time = 120) =>
    client.get<Blob>('/datasurfr/export-feed', { params: { time }, responseType: 'blob' }).then((r) => r.data),
  listMapProperties: () =>
    client.get<DatasurfrMapProperty[]>('/datasurfr/map-properties').then((r) => r.data),
  importAlerts: (payload: DatasurfrImportPayload) =>
    client.post<DatasurfrImportResponse>('/datasurfr/import', payload).then((r) => r.data),
  importEventsSummary: (payload: DatasurfrImportPayload) =>
    client.post<DatasurfrEventsSummaryImportResponse>('/datasurfr/import-events-summary', payload).then((r) => r.data),
  importRegionSummary: (payload: DatasurfrRegionSummaryImportPayload) =>
    client.post<DatasurfrRegionSummaryImportResponse>('/datasurfr/import-region-summary', payload).then((r) => r.data),
}

