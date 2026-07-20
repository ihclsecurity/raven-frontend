/**
 * Module: Property Mapping
 * Purpose: Admin UI for reviewing and editing property mapping rows.
 * Context: Saves changes to MongoDB for property impact mapping.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react'
import { propertyMappingApi } from '../api/propertyMapping'
import { useAuth } from '../auth/AuthContext'
import type { PropertyMappingCellValue, PropertyMappingListResponse, PropertyMappingRow } from '../types/propertyMapping'
import { hasFullAccess } from '../utils/authRoles'

const STATUS_OPTIONS = ['Operational', 'Pipeline', 'Future', 'Currently Inactive', 'To be terminated']
const TABLE_COLUMNS = ['Property Name', 'Status', 'Brand', 'City', 'State', 'Region', 'Country', 'Latitude', 'Longitude']
const PRIORITY_EDIT_COLUMNS = ['Property Name', 'Status', 'Brand', 'City', 'State', 'Region', 'Country', 'Latitude', 'Longitude', 'Inventory']
const CREATE_REQUIRED_COLUMNS = ['Property Name', 'Status', 'City', 'State', 'Region', 'Country', 'Latitude', 'Longitude']
const PROPERTY_MAPPING_PAGE_SIZE = 20
const CREATE_HIDDEN_COLUMNS = [
  'Match Status',
  'Matched Old Property Name',
  'Match Score',
  'Matched Old City',
  'Matched Old Brand',
  'Country Fill Source',
  'Coordinate Issues',
]

function cellToInputValue(value: PropertyMappingCellValue | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase()
}

function statusBucket(value: string): 'operational' | 'pipeline' | 'future' | 'other' {
  const normalized = value.trim().toLowerCase().replace(/-/g, ' ')
  if (normalized === 'operational') return 'operational'
  if (normalized === 'pipeline') return 'pipeline'
  if (normalized === 'future') return 'future'
  return 'other'
}

function buildChangedValues(
  columns: string[],
  original: PropertyMappingRow,
  draft: Record<string, PropertyMappingCellValue>,
): Record<string, PropertyMappingCellValue> {
  const changed: Record<string, PropertyMappingCellValue> = {}
  for (const column of columns) {
    const before = cellToInputValue(original.values[column])
    const after = cellToInputValue(draft[column])
    if (before !== after) {
      changed[column] = draft[column] ?? null
    }
  }
  return changed
}

function buildNewPropertyDraft(columns: string[]): Record<string, PropertyMappingCellValue> {
  const draft: Record<string, PropertyMappingCellValue> = {}
  for (const column of columns) {
    draft[column] = column === 'Status' ? 'Operational' : ''
  }
  return draft
}

export default function PropertyMappingPage() {
  const { user } = useAuth()
  const canManageProperties = hasFullAccess(user)
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Record<string, PropertyMappingCellValue>>({})
  const [isAdding, setIsAdding] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedRowId, setSavedRowId] = useState<number | null>(null)
  const [focusedEditColumn, setFocusedEditColumn] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const editFieldRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({})

  const { data, isLoading, error } = useQuery({
    queryKey: ['property-mapping'],
    queryFn: propertyMappingApi.list,
    enabled: canManageProperties,
  })

  const columns = data?.columns || []
  const visibleColumns = TABLE_COLUMNS.filter((column) => columns.includes(column))
  const editColumns = useMemo(() => {
    const priority = PRIORITY_EDIT_COLUMNS.filter((column) => columns.includes(column))
    const remaining = columns.filter((column) => !priority.includes(column))
    return [...priority, ...remaining]
  }, [columns])
  const createColumns = useMemo(() => {
    const hidden = new Set(CREATE_HIDDEN_COLUMNS)
    return editColumns.filter((column) => !hidden.has(column))
  }, [editColumns])

  const selectedRow = useMemo(
    () => (data?.rows || []).find((row) => row.row_id === selectedRowId) || null,
    [data?.rows, selectedRowId],
  )

  useEffect(() => {
    if (!selectedRow) return
    setDraft(selectedRow.values)
    setSaveError(null)
  }, [selectedRow])

  useEffect(() => {
    if (!focusedEditColumn || (!selectedRow && !isAdding)) return
    const frame = window.requestAnimationFrame(() => {
      editFieldRefs.current[focusedEditColumn]?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusedEditColumn, isAdding, selectedRow])

  const updateMutation = useMutation({
    mutationFn: ({ rowId, values }: { rowId: number; values: Record<string, PropertyMappingCellValue> }) =>
      propertyMappingApi.updateRow(rowId, { values }),
    onSuccess: async (row) => {
      setSavedRowId(row.row_id)
      setDraft(row.values)
      setSaveError(null)
      window.setTimeout(() => setSavedRowId(null), 2200)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['property-mapping'] }),
        queryClient.invalidateQueries({ queryKey: ['map-view-properties'] }),
      ])
    },
    onError: (saveErrorValue) => {
      const message = saveErrorValue instanceof Error ? saveErrorValue.message : 'Failed to save property row.'
      setSaveError(message)
    },
  })

  const createMutation = useMutation({
    mutationFn: (values: Record<string, PropertyMappingCellValue>) =>
      propertyMappingApi.createRow({ values }),
    onSuccess: async (row) => {
      queryClient.setQueryData<PropertyMappingListResponse>(['property-mapping'], (current) => {
        if (!current) return current
        const existingRows = current.rows.filter((item) => item.row_id !== row.row_id)
        const nextRows = [row, ...existingRows]
        const summary = nextRows.reduce(
          (acc, item) => {
            acc.total += 1
            acc[statusBucket(cellToInputValue(item.values.Status))] += 1
            return acc
          },
          { total: 0, operational: 0, pipeline: 0, future: 0, other: 0 },
        )
        return {
          ...current,
          rows: nextRows,
          summary,
        }
      })
      setIsAdding(false)
      setSelectedRowId(row.row_id)
      setSavedRowId(row.row_id)
      setDraft(row.values)
      setSearch(cellToInputValue(row.values['Property Name']))
      setStatusFilter('all')
      setCurrentPage(1)
      setSaveError(null)
      window.setTimeout(() => setSavedRowId(null), 2200)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['property-mapping'] }),
        queryClient.invalidateQueries({ queryKey: ['map-view-properties'] }),
      ])
    },
    onError: (saveErrorValue) => {
      const message = saveErrorValue instanceof Error ? saveErrorValue.message : 'Failed to add property row.'
      setSaveError(message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (rowId: number) => propertyMappingApi.deleteRow(rowId),
    onSuccess: async () => {
      setIsAdding(false)
      setSelectedRowId(null)
      setDraft({})
      setSaveError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['property-mapping'] }),
        queryClient.invalidateQueries({ queryKey: ['map-view-properties'] }),
      ])
    },
    onError: (saveErrorValue) => {
      const message = saveErrorValue instanceof Error ? saveErrorValue.message : 'Failed to remove property row.'
      setSaveError(message)
    },
  })

  const filteredRows = useMemo(() => {
    const rows = data?.rows || []
    const query = normalizeSearch(search)
    return rows.filter((row) => {
      const bucket = statusBucket(cellToInputValue(row.values.Status))
      if (statusFilter !== 'all' && bucket !== statusFilter) return false
      if (!query) return true
      return columns.some((column) => cellToInputValue(row.values[column]).toLowerCase().includes(query))
    })
  }, [columns, data?.rows, search, statusFilter])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PROPERTY_MAPPING_PAGE_SIZE))
  const normalizedPage = Math.min(currentPage, pageCount)
  const pageStartIndex = (normalizedPage - 1) * PROPERTY_MAPPING_PAGE_SIZE
  const paginatedRows = filteredRows.slice(pageStartIndex, pageStartIndex + PROPERTY_MAPPING_PAGE_SIZE)
  const pageEndIndex = pageStartIndex + paginatedRows.length

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount)
    }
  }, [currentPage, pageCount])

  const changedValues = selectedRow && !isAdding ? buildChangedValues(editColumns, selectedRow, draft) : {}
  const createValues = isAdding ? Object.fromEntries(createColumns.map((column) => [column, draft[column] ?? null])) : {}
  const missingCreateFields = isAdding
    ? CREATE_REQUIRED_COLUMNS.filter((column) => !cellToInputValue(draft[column]).trim())
    : []
  const isDirty = isAdding || Object.keys(changedValues).length > 0
  const summary = data?.summary

  if (!canManageProperties) {
    return (
      <section className="property-mapping-page">
        <div className="property-mapping-empty">Only Analyst/Admin and Superadmin users can access Property Mapping.</div>
      </section>
    )
  }

  const setDraftValue = (column: string, value: string) => {
    setDraft((current) => ({ ...current, [column]: value }))
  }

  const selectRowForEdit = (rowId: number, column?: string) => {
    setIsAdding(false)
    setSelectedRowId(rowId)
    setFocusedEditColumn(column ?? null)
  }

  const startAddingProperty = () => {
    if (!columns.length) return
    setIsAdding(true)
    setSelectedRowId(null)
    setDraft(buildNewPropertyDraft(columns))
    setFocusedEditColumn('Property Name')
    setSearch('')
    setStatusFilter('all')
    setCurrentPage(1)
    setSaveError(null)
  }

  const resetDraft = () => {
    if (isAdding) {
      setIsAdding(false)
      setDraft({})
      setSaveError(null)
      return
    }
    if (!selectedRow) return
    setDraft(selectedRow.values)
    setSaveError(null)
  }

  const saveSelectedRow = () => {
    if (isAdding) {
      if (missingCreateFields.length) {
        setSaveError(`Fill required field(s): ${missingCreateFields.join(', ')}`)
        return
      }
      createMutation.mutate(createValues)
      return
    }
    if (!selectedRow || !isDirty) return
    updateMutation.mutate({ rowId: selectedRow.row_id, values: changedValues })
  }

  const removeSelectedRow = () => {
    if (!selectedRow || isAdding || deleteMutation.isPending) return
    const propertyName = cellToInputValue(selectedRow.values['Property Name']) || `row ${selectedRow.row_id}`
    const confirmed = window.confirm(`Remove ${propertyName} from property mapping? This writes to MongoDB.`)
    if (!confirmed) return
    deleteMutation.mutate(selectedRow.row_id)
  }

  const editorPending = updateMutation.isPending || createMutation.isPending || deleteMutation.isPending

  return (
    <section className="property-mapping-page">
      <div className="property-mapping-hero">
        <div>
          <p>Review the property mappings on the left. Select a property to edit it, or add a new property row.</p>
        </div>
        <div className="property-mapping-disclaimer" role="note">
          <AlertTriangle size={16} />
          Saved properties are stored in MongoDB and become available to map data after refresh.
        </div>
      </div>

      <div className="property-mapping-stats">
        <button type="button" className={`property-mapping-stat${statusFilter === 'all' ? ' is-selected' : ''}`} onClick={() => setStatusFilter('all')}>
          <span>Total</span>
          <strong>{summary?.total ?? 0}</strong>
        </button>
        <button type="button" className={`property-mapping-stat is-operational${statusFilter === 'operational' ? ' is-selected' : ''}`} onClick={() => setStatusFilter('operational')}>
          <span>Operational</span>
          <strong>{summary?.operational ?? 0}</strong>
        </button>
        <button type="button" className={`property-mapping-stat is-pipeline${statusFilter === 'pipeline' ? ' is-selected' : ''}`} onClick={() => setStatusFilter('pipeline')}>
          <span>Pipeline</span>
          <strong>{summary?.pipeline ?? 0}</strong>
        </button>
        <button type="button" className={`property-mapping-stat is-future${statusFilter === 'future' ? ' is-selected' : ''}`} onClick={() => setStatusFilter('future')}>
          <span>Future</span>
          <strong>{summary?.future ?? 0}</strong>
        </button>
        <button type="button" className={`property-mapping-stat is-other${statusFilter === 'other' ? ' is-selected' : ''}`} onClick={() => setStatusFilter('other')}>
          <span>Non-operational / Other</span>
          <strong>{summary?.other ?? 0}</strong>
        </button>
      </div>

      <div className="property-mapping-toolbar">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search properties, cities, brands, regions..."
          aria-label="Search property mapping"
        />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by property status">
          <option value="all">All statuses</option>
          <option value="operational">Operational</option>
          <option value="pipeline">Pipeline</option>
          <option value="future">Future</option>
          <option value="other">Non-operational / Other</option>
        </select>
        <button type="button" className="btn-primary property-mapping-add-btn" onClick={startAddingProperty} disabled={!columns.length || isLoading}>
          <Plus size={14} />
          Add property
        </button>
      </div>

      {error ? <div className="property-mapping-error">{error instanceof Error ? error.message : 'Failed to load property mapping.'}</div> : null}

        <div className="property-mapping-layout">
        <div className="property-mapping-table-shell raven-dark-scroll">
          <table className="property-mapping-table">
            <thead>
              <tr>
                <th className="property-mapping-row-header">Row</th>
                {visibleColumns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={visibleColumns.length + 1} className="property-mapping-loading">Loading property mapping...</td>
                </tr>
              ) : null}
              {!isLoading && isAdding ? (
                <tr className="is-active is-dirty">
                  <td className="property-mapping-row-header">New</td>
                  {visibleColumns.map((column) => (
                    <td key={`new-property-${column}`} className={column === 'Property Name' ? 'property-mapping-name-cell' : ''}>
                      <button
                        type="button"
                        className="property-mapping-cell-button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setFocusedEditColumn(column)
                        }}
                        title={`Edit ${column}`}
                      >
                        {cellToInputValue(draft[column]) || (column === 'Property Name' ? 'New property' : '-')}
                      </button>
                    </td>
                  ))}
                </tr>
              ) : null}
              {!isLoading && paginatedRows.map((row) => {
                const active = row.row_id === selectedRowId
                return (
                  <tr
                    key={row.row_id}
                    className={active && !isAdding ? 'is-active' : ''}
                    onClick={() => selectRowForEdit(row.row_id)}
                  >
                    <td className="property-mapping-row-header">{row.row_id}</td>
                    {visibleColumns.map((column) => (
                      <td key={`${row.row_id}-${column}`} className={column === 'Property Name' ? 'property-mapping-name-cell' : ''}>
                        <button
                          type="button"
                          className="property-mapping-cell-button"
                          onClick={(event) => {
                            event.stopPropagation()
                            selectRowForEdit(row.row_id, column)
                          }}
                          title={`Edit ${column}: ${cellToInputValue(row.values[column]) || '-'}`}
                        >
                          {cellToInputValue(row.values[column]) || '-'}
                        </button>
                      </td>
                    ))}
                  </tr>
                )
              })}
              {!isLoading && !filteredRows.length ? (
                <tr>
                  <td colSpan={visibleColumns.length + 1} className="property-mapping-loading">No properties match the current filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {!isLoading && filteredRows.length ? (
          <div className="property-mapping-pagination" aria-label="Property mapping pagination">
            <span>
              Showing {pageStartIndex + 1}-{pageEndIndex} of {filteredRows.length} properties
            </span>
            <div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={normalizedPage <= 1}
              >
                Previous
              </button>
              <strong>Page {normalizedPage} of {pageCount}</strong>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                disabled={normalizedPage >= pageCount}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}

        <aside className="property-mapping-editor raven-dark-scroll">
          {isAdding || selectedRow ? (
            <>
              <div className="property-mapping-editor-head">
                <div>
                  <span>{isAdding ? 'Adding property' : `Editing row ${selectedRow?.row_id}`}</span>
                  <strong>{cellToInputValue(draft['Property Name']) || (isAdding ? 'New property' : 'Unnamed property')}</strong>
                </div>
                {savedRowId === selectedRow?.row_id ? <em>Saved</em> : null}
              </div>
              {saveError ? <div className="property-mapping-error">{saveError}</div> : null}
              {isAdding ? (
                <div className="property-mapping-required-note">
                  Required for map visibility: {CREATE_REQUIRED_COLUMNS.join(', ')}. Status must be Operational to show on the map.
                </div>
              ) : null}
              <div className="property-mapping-editor-grid">
                {(isAdding ? createColumns : editColumns).map((column) => (
                  <label key={column} className={column === 'Property Name' ? 'is-wide' : ''}>
                    <span>{column}</span>
                    {column === 'Status' ? (
                      <select
                        ref={(element) => {
                          editFieldRefs.current[column] = element
                        }}
                        value={cellToInputValue(draft[column])}
                        onChange={(event) => setDraftValue(column, event.target.value)}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                        {!STATUS_OPTIONS.includes(cellToInputValue(draft[column])) ? (
                          <option value={cellToInputValue(draft[column])}>{cellToInputValue(draft[column]) || 'Blank'}</option>
                        ) : null}
                      </select>
                    ) : (
                      <input
                        ref={(element) => {
                          editFieldRefs.current[column] = element
                        }}
                        type={column === 'Latitude' || column === 'Longitude' || column === 'Inventory' || column === 'Match Score' ? 'number' : 'text'}
                        step={column === 'Latitude' || column === 'Longitude' ? 'any' : undefined}
                        value={cellToInputValue(draft[column])}
                        onChange={(event) => setDraftValue(column, event.target.value)}
                      />
                    )}
                  </label>
                ))}
              </div>
              <div className="property-mapping-editor-actions">
                {!isAdding && selectedRow ? (
                  <button type="button" className="property-mapping-delete-btn" onClick={removeSelectedRow} disabled={editorPending} aria-label="Remove property">
                    <Trash2 size={15} />
                    Remove
                  </button>
                ) : null}
                <button type="button" className={`btn-secondary${isAdding ? ' btn-danger-action' : ''}`} onClick={resetDraft} disabled={(!isDirty && !isAdding) || editorPending}>
                  {isAdding ? <X size={14} /> : <RotateCcw size={14} />}
                  {isAdding ? 'Cancel' : 'Discard'}
                </button>
                <button type="button" className="btn-primary" onClick={saveSelectedRow} disabled={!isDirty || editorPending}>
                  <Save size={14} />
                  {deleteMutation.isPending ? 'Removing...' : editorPending ? 'Saving...' : isAdding ? 'Save property' : 'Save changes'}
                </button>
              </div>
            </>
          ) : (
            <div className="property-mapping-editor-empty">
              Select a property from the table to edit its name, status, coordinates, region, and mapping metadata.
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}
