/**
 * Auto Save Hook
 *
 * What this file does
 * -------------------
 * This hook periodically saves a notification draft when the watched fields
 * change. It keeps the manual-save fallback available, but it reduces the risk
 * of lost work while the editor is open.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the field filter first, then the interval effect. The important rule is
 * that we only auto-save the fields the backend actually accepts.
 *
 * When to change this file
 * ------------------------
 * Update this file when the editable notification field list changes or when
 * the auto-save cadence needs to change.
 *
 * What this file does not do
 * --------------------------
 * This hook does not decide when the user has finished editing. It only tracks
 * dirty state and sends the save request.
 */

import { useEffect, useRef, useState } from 'react'
import { notificationsApi } from '../api/notifications'

// Only these fields are eligible for background saves because they are the
// editable notification fields the backend understands.
const AUTO_SAVE_KEYS = [
  'heading',
  'email_subject',
  'template_id',
  'severity',
  'confidence',
  'business_impact',
  'incident_type',
  'geography_json',
  'source_text',
  'generated_text',
  'edited_text',
  'final_text',
  'channel_email_text',
  'status',
] as const

function pickAutoSaveFields(source: Record<string, unknown>) {
  const payload: Record<string, unknown> = {}
  for (const key of AUTO_SAVE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      payload[key] = source[key]
    }
  }
  return payload
}

export function useAutoSave(notificationId: number | null, fields: Record<string, unknown>, intervalMs = 30000) {
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [saving, setSaving] = useState(false)
  const dirtyRef = useRef(false)
  const fieldsRef = useRef(fields)

  useEffect(() => {
    fieldsRef.current = fields
    dirtyRef.current = true
  }, [fields])

  useEffect(() => {
    if (!notificationId) return

    const interval = setInterval(async () => {
      if (!dirtyRef.current) return
      try {
        setSaving(true)
        await notificationsApi.update(notificationId, pickAutoSaveFields(fieldsRef.current))
        setLastSavedAt(new Date())
        dirtyRef.current = false
      } catch {
        // Silent auto-save failure; manual save remains available.
      } finally {
        setSaving(false)
      }
    }, intervalMs)

    return () => clearInterval(interval)
  }, [notificationId, intervalMs])

  return { lastSavedAt, saving }
}

