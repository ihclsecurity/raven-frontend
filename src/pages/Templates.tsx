/**
 * Module: Templates
 * Purpose: Core module responsible for Templates concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { templatesApi } from '../api/templates'
import { TemplateList } from '../components/templates/TemplateList'
import { TemplateForm } from '../components/templates/TemplateForm'
import type { Template, TemplateCreate, TemplateUpdate } from '../types/template'

const emptyTemplate: Partial<Template> = {
  name: '',
  type: 'notification',
  category: 'Advisory',
  owner: 'Security Ops',
  body_instructions: '',
  required_metadata_json: '',
  default_tone: '',
  version_notes: '',
}

function buildTemplatePayload(template: Partial<Template>): TemplateCreate | TemplateUpdate {
  const category = String(template.category || '').trim()
  const inferredType = category === 'Summary' ? 'summary' : 'notification'

  return {
    name: String(template.name || '').trim(),
    type: inferredType,
    category,
    owner: String(template.owner || 'Security Ops').trim(),
    body_instructions: String(template.body_instructions || '').trim(),
    required_metadata_json: String(template.required_metadata_json || '').trim(),
    default_tone: String(template.default_tone || '').trim(),
    version_notes: String(template.version_notes || '').trim(),
    ...(typeof template.active === 'boolean' ? { active: template.active } : {}),
  }
}

export default function TemplatesPage() {
  const queryClient = useQueryClient()
  const { data: templates = [] } = useQuery({ queryKey: ['templates', false], queryFn: () => templatesApi.list(false) })

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Partial<Template>>(emptyTemplate)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedId) {
      return
    }
    const selected = templates.find((t) => t.id === selectedId)
    if (selected) {
      setDraft({
        ...selected,
        default_tone: selected.default_tone === 'Professional / Formal' ? '' : selected.default_tone,
      })
      setError(null)
    }
  }, [selectedId, templates])

  const onSave = async () => {
    if (!String(draft.version_notes || '').trim()) {
      setError('Version notes are required.')
      return
    }
    setError(null)
    const payload = buildTemplatePayload(draft)

    try {
      const saved = draft.id
        ? await templatesApi.update(draft.id, payload)
        : await templatesApi.create(payload)

      setSelectedId(saved.id)
      setDraft(saved)
      await queryClient.invalidateQueries({ queryKey: ['templates'] })
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Failed to save template.'
      setError(message)
    }
  }

  const onDeactivate = draft.id
    ? async () => {
        setError(null)
        try {
          const updated = await templatesApi.deactivate(draft.id as number)
          setSelectedId(updated.id)
          setDraft(updated)
          await queryClient.invalidateQueries({ queryKey: ['templates'] })
        } catch (deactivateError) {
          const message = deactivateError instanceof Error ? deactivateError.message : 'Failed to deactivate template.'
          setError(message)
        }
      }
    : undefined

  const onDuplicate = draft.id
    ? async () => {
        setError(null)
        try {
          const duplicated = await templatesApi.duplicate(draft.id as number)
          setSelectedId(duplicated.id)
          setDraft(duplicated)
          await queryClient.invalidateQueries({ queryKey: ['templates'] })
        } catch (duplicateError) {
          const message = duplicateError instanceof Error ? duplicateError.message : 'Failed to duplicate template.'
          setError(message)
        }
      }
    : undefined

  const onDelete = draft.id
    ? async () => {
        setError(null)
        try {
          const deletedId = draft.id as number
          await templatesApi.remove(deletedId)
          setSelectedId(null)
          setDraft({ ...emptyTemplate })
          await queryClient.invalidateQueries({ queryKey: ['templates'] })
        } catch (deleteError) {
          const message = deleteError instanceof Error ? deleteError.message : 'Failed to delete template.'
          setError(message)
        }
      }
    : undefined

  return (
    <section className="templates-page">
      <div className="templates-layout">
        <TemplateList
          templates={templates}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onNew={() => {
            setSelectedId(null)
            setDraft({ ...emptyTemplate })
            setError(null)
          }}
        />
        <TemplateForm
          template={draft}
          onChange={(key, value) => setDraft((prev) => ({ ...prev, [key]: value }))}
          onSave={onSave}
          onDeactivate={onDeactivate}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          error={error}
        />
      </div>
    </section>
  )
}

