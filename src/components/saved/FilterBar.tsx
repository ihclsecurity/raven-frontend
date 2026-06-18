/**
 * Module: Filterbar
 * Purpose: Core module responsible for Filterbar concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

import { useTemplates } from '../../hooks/useTemplates'

interface FilterBarProps {
  filters: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  onClear: () => void
}

export function FilterBar({ filters, onChange, onClear }: FilterBarProps) {
  const { data: templates } = useTemplates(true)

  return (
    <div className="saved-filter-bar">
      <input type="date" value={(filters.date_from as string) || ''} onChange={(e) => onChange('date_from', e.target.value || undefined)} />
      <input type="date" value={(filters.date_to as string) || ''} onChange={(e) => onChange('date_to', e.target.value || undefined)} />
      <select value={String(filters.template_id || '')} onChange={(e) => onChange('template_id', e.target.value ? Number(e.target.value) : undefined)}>
        <option value="">All templates</option>
        {(templates || []).map((template) => (
          <option key={template.id} value={template.id}>{template.name}</option>
        ))}
      </select>
      <select value={(filters.severity as string) || ''} onChange={(e) => onChange('severity', e.target.value || undefined)}>
        <option value="">All severities</option>
        <option>Catastrophic</option>
        <option>Major</option>
        <option>Moderate</option>
        <option>Minor</option>
        <option>Informational</option>
      </select>
      <input placeholder="Search heading/source" value={(filters.search as string) || ''} onChange={(e) => onChange('search', e.target.value || undefined)} />
      <button type="button" className="btn-secondary" onClick={onClear}>Clear Filters</button>
    </div>
  )
}

