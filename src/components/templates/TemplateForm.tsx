/**
 * Module: Templateform
 * Purpose: Core module responsible for Templateform concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

import { useState } from 'react'
import type { Template } from '../../types/template'
import { ConfirmDialog } from '../common/ConfirmDialog'

interface TemplateFormProps {
  template: Partial<Template>
  onChange: (key: string, value: unknown) => void
  onSave: () => void
  onDeactivate?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  error?: string | null
}

export function TemplateForm({ template, onChange, onSave, onDeactivate, onDuplicate, onDelete, error }: TemplateFormProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  return (
    <section className="templates-form-panel">
      <h3 className="templates-form-title">{template.id ? 'Edit Template' : 'New Template'}</h3>
      {error ? <div className="templates-form-error">{error}</div> : null}
      <label>
        Name
        <input value={template.name || ''} onChange={(e) => onChange('name', e.target.value)} />
      </label>
      <label>
        Brief Description
        <input
          value={template.default_tone || ''}
          onChange={(e) => onChange('default_tone', e.target.value)}
          placeholder="Short description of what this template produces"
        />
      </label>
      <label>
        Category
        <select value={template.category || 'Advisory'} onChange={(e) => onChange('category', e.target.value)}>
          <option value="Advisory">Advisory</option>
          <option value="Incident Reporting">Incident Reporting</option>
          <option value="Summary">Summary</option>
        </select>
      </label>
      <label>
        LLM Instructions
        <textarea value={template.body_instructions || ''} onChange={(e) => onChange('body_instructions', e.target.value)} rows={8} />
      </label>
      <label>
        Required Classification and Geographical Data
        <input
          value={template.required_metadata_json || ''}
          onChange={(e) => onChange('required_metadata_json', e.target.value)}
          placeholder="Example: severity, confidence, business_impact, geography"
        />
      </label>
      <label>
        Version Notes
        <input value={template.version_notes || ''} onChange={(e) => onChange('version_notes', e.target.value)} />
      </label>

      <div className="templates-form-actions">
        <button type="button" className="btn-primary" onClick={onSave}>Save</button>
        {onDeactivate ? <button type="button" className="btn-secondary" onClick={onDeactivate}>Deactivate</button> : null}
        {onDuplicate ? <button type="button" className="btn-secondary" onClick={onDuplicate}>Duplicate</button> : null}
        {onDelete ? <button type="button" className="btn-danger" onClick={() => setDeleteConfirmOpen(true)}>Delete</button> : null}
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete Template?"
        body="This will permanently remove the template and detach it from any notifications currently using it."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger={true}
        onConfirm={() => {
          onDelete?.()
          setDeleteConfirmOpen(false)
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </section>
  )
}

