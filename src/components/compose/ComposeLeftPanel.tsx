/**
 * Module: Composeleftpanel
 * Purpose: Core module responsible for Composeleftpanel concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

import { useMemo, useState } from 'react'
import { ClassificationFields } from './ClassificationFields'
import { GeographyFields } from './GeographyFields'
import { parseGeographyJson, stringifyGeography, type GeographySelection } from '../../constants/geography'
import { ConfirmDialog } from '../common/ConfirmDialog'

type ComposeAnalysisSettings = {
  severityOptions: string[]
  confidenceOptions: string[]
  businessImpactOptions: string[]
  incidentTypeOptions: string[]
}

interface ComposeLeftPanelProps {
  fields: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  onFieldChange: (key: string, value: unknown) => void
  autoExtractedFields: Set<string>
  onDoneSourceInput: () => void
  onClearSourceInput: () => void
  validationError: string | null
}

interface ComposeAnalysisPanelProps {
  fields: Record<string, unknown>
  onFieldChange: (key: string, value: unknown) => void
  autoExtractedFields: Set<string>
  settings: ComposeAnalysisSettings | null
}

export function ComposeLeftPanel({
  fields,
  onChange,
  onFieldChange,
  autoExtractedFields,
  onDoneSourceInput,
  onClearSourceInput,
  validationError,
}: ComposeLeftPanelProps) {
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  const heading = (fields.heading as string) || ''
  const sourceText = (fields.source_text as string) || ''
  const hasClearableContent = [
    fields.source_text,
    fields.heading,
    fields.severity,
    fields.confidence,
    fields.business_impact,
    fields.incident_type,
    fields.geography_json,
    fields.generated_text,
    fields.edited_text,
    fields.final_text,
    fields.email_subject,
  ].some((value) => String(value ?? '').trim().length > 0)
  const headingRows = useMemo(() => {
    const wrappedLines = Math.ceil(heading.length / 70)
    const explicitLines = heading.split('\n').length
    return Math.max(2, wrappedLines, explicitLines)
  }, [heading])

  const handleRequestClear = () => {
    if (!hasClearableContent && autoExtractedFields.size === 0) return
    setClearConfirmOpen(true)
  }

  const handleConfirmClear = () => {
    onClearSourceInput()
    setClearConfirmOpen(false)
  }

  return (
    <section className="compose-left-stack">
      <div className="compose-panel compose-source-panel">
        <div className="compose-panel-heading">
          <div>
            <h2>Source Intelligence</h2>
            <p className="compose-panel-copy">Paste raw intelligence and import structured context.</p>
          </div>
        </div>

        <label>
          Notification Heading
          <textarea
            autoFocus
            value={heading}
            onChange={(e) => onFieldChange('heading', e.target.value)}
            className={`compose-heading-input${autoExtractedFields.has('heading') ? ' auto-extracted' : ''}`}
            placeholder="Short headline-style title"
            rows={headingRows}
          />
        </label>
        {validationError ? <div className="compose-inline-error">{validationError}</div> : null}

        <textarea
          value={sourceText}
          onChange={(e) => onChange('source_text', e.target.value)}
          className="compose-source-textarea"
          rows={10}
          placeholder="Paste source intelligence, news article, or raw text..."
        />

        <div className="compose-inline-actions compose-source-actions">
          <div className="compose-inline-action-buttons">
            <button
              type="button"
              className="btn-ghost"
              onClick={handleRequestClear}
              disabled={!hasClearableContent && autoExtractedFields.size === 0}
            >
              Clear
            </button>
            <button type="button" className="btn-primary" onClick={onDoneSourceInput}>
              Done
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={clearConfirmOpen}
        title="Clear All Content Data?"
        body="This will remove source text, extracted fields, generated content, and related content metadata from the current draft."
        confirmLabel="Clear All"
        cancelLabel="Keep"
        danger={true}
        onConfirm={handleConfirmClear}
        onCancel={() => setClearConfirmOpen(false)}
      />
    </section>
  )
}

export function ComposeAnalysisPanel({
  fields,
  onFieldChange,
  autoExtractedFields,
  settings,
}: ComposeAnalysisPanelProps) {
  const geographyValue: GeographySelection = useMemo(
    () => parseGeographyJson(fields.geography_json),
    [fields.geography_json],
  )
  const geographyAutoExtracted = autoExtractedFields.has('geography_json')
  const hasAutoExtracted = autoExtractedFields.size > 0

  const handleGeographyChange = (next: GeographySelection) => {
    onFieldChange('geography_json', stringifyGeography(next))
  }

  return (
    <section className={`compose-analysis-section${geographyAutoExtracted ? ' is-auto-extracted' : ''}`}>
      <div className="compose-analysis-head">
        <div>
          <h2>Analysis</h2>
          <p className="compose-panel-copy">Validate classification and geography before generating the advisory.</p>
        </div>
        {hasAutoExtracted ? (
          <div className="compose-auto-extracted-summary">
            Auto Extracted
          </div>
        ) : null}
      </div>

      <div className="compose-analysis-grid">
        <div className="compose-analysis-group">
          <h3 className="compose-analysis-group-title">Event Classification</h3>
          <ClassificationFields
            severityOptions={settings?.severityOptions || []}
            confidenceOptions={settings?.confidenceOptions || []}
            impactOptions={settings?.businessImpactOptions || []}
            incidentTypeOptions={settings?.incidentTypeOptions || []}
            value={fields}
            onFieldChange={onFieldChange}
            autoExtractedFields={autoExtractedFields}
          />
        </div>
        <div className="compose-analysis-group">
          <h3 className="compose-analysis-group-title">Geographical Analysis</h3>
          <GeographyFields value={geographyValue} onChange={handleGeographyChange} />
        </div>
      </div>
    </section>
  )
}

