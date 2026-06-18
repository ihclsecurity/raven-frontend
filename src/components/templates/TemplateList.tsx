/**
 * Module: Templatelist
 * Purpose: Core module responsible for Templatelist concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

import type { Template } from '../../types/template'

interface TemplateListProps {
  templates: Template[]
  selectedId: number | null
  onSelect: (id: number) => void
  onNew: () => void
}

export function TemplateList({ templates, selectedId, onSelect, onNew }: TemplateListProps) {
  return (
    <section className="templates-list-panel">
      <div className="templates-list-head">
        <h3>Templates</h3>
        <button type="button" className="btn-secondary" onClick={onNew}>New</button>
      </div>
      <div className="templates-list-grid">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onSelect(template.id)}
            className={`templates-list-item${selectedId === template.id ? ' is-active' : ''}`}
          >
            <div className="templates-list-item-name">{template.name}</div>
            <div className="templates-list-item-meta">{template.type} | v{template.version}</div>
          </button>
        ))}
      </div>
    </section>
  )
}

