/**
 * Property Mapping API
 *
 * What this file does
 * -------------------
 * This file wraps the property-mapping endpoints used to map brands and hotel
 * properties to the alert and map workflows.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the lookup methods first, then the save and search helpers. That order
 * matches the way the mapping editor resolves candidate properties.
 *
 * When to change this file
 * ------------------------
 * Update this file when the backend property mapping model changes or when the
 * editor needs additional lookup data.
 *
 * What this file does not do
 * --------------------------
 * This file does not decide how properties are matched. It only talks to the
 * mapping endpoints.
 */

import client from './client'
import type {
  PropertyMappingCreatePayload,
  PropertyMappingListResponse,
  PropertyMappingRow,
  PropertyMappingUpdatePayload,
} from '../types/propertyMapping'

export const propertyMappingApi = {
  list: () => client.get<PropertyMappingListResponse>('/property-mapping').then((r) => r.data),
  createRow: (payload: PropertyMappingCreatePayload) =>
    client.post<PropertyMappingRow>('/property-mapping', payload).then((r) => r.data),
  updateRow: (rowId: number, payload: PropertyMappingUpdatePayload) =>
    client.put<PropertyMappingRow>(`/property-mapping/${rowId}`, payload).then((r) => r.data),
  deleteRow: (rowId: number) =>
    client.delete<PropertyMappingRow>(`/property-mapping/${rowId}`).then((r) => r.data),
}

