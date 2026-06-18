/**
 * Module: Classificationfields
 * Purpose: Core module responsible for Classificationfields concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

interface ClassificationFieldsProps {
  severityOptions: string[]
  confidenceOptions: string[]
  impactOptions: string[]
  incidentTypeOptions: string[]
  value: Record<string, unknown>
  onFieldChange: (key: string, value: unknown) => void
  autoExtractedFields: Set<string>
}

export function ClassificationFields({
  severityOptions,
  confidenceOptions,
  impactOptions,
  incidentTypeOptions,
  value,
  onFieldChange,
  autoExtractedFields,
}: ClassificationFieldsProps) {
  const businessImpactValue = ((value.business_impact as string) || '').trim()
  const incidentTypeValue = ((value.incident_type as string) || '').trim()
  const impactHasValue = impactOptions.some((option) => option.toLowerCase() === businessImpactValue.toLowerCase())
  const incidentHasValue = incidentTypeOptions.some((option) => option.toLowerCase() === incidentTypeValue.toLowerCase())
  const impactOptionsWithCurrent = businessImpactValue && !impactHasValue ? [businessImpactValue, ...impactOptions] : impactOptions
  const incidentTypeOptionsWithCurrent = incidentTypeValue && !incidentHasValue ? [incidentTypeValue, ...incidentTypeOptions] : incidentTypeOptions

  return (
    <div className="compose-form-stack compose-classification-grid">
      <label>
        Severity
        <select
          value={(value.severity as string) || ''}
          onChange={(e) => onFieldChange('severity', e.target.value || null)}
          className={autoExtractedFields.has('severity') ? 'auto-extracted' : ''}
        >
          <option value="">Select</option>
          {severityOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>

      <label>
        Confidence
        <select
          value={(value.confidence as string) || ''}
          onChange={(e) => onFieldChange('confidence', e.target.value || null)}
          className={autoExtractedFields.has('confidence') ? 'auto-extracted' : ''}
        >
          <option value="">Select</option>
          {confidenceOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>

      <label>
        Business Impact
        <select
          value={businessImpactValue}
          onChange={(e) => onFieldChange('business_impact', e.target.value || null)}
          className={autoExtractedFields.has('business_impact') ? 'auto-extracted' : ''}
        >
          <option value="">Select</option>
          {impactOptionsWithCurrent.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>

      <label>
        Incident Type
        <select
          value={incidentTypeValue}
          onChange={(e) => onFieldChange('incident_type', e.target.value || null)}
          className={autoExtractedFields.has('incident_type') ? 'auto-extracted' : ''}
        >
          <option value="">Select</option>
          {incidentTypeOptionsWithCurrent.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    </div>
  )
}

