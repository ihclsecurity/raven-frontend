/**
 * Advisory Template Selection
 *
 * What this file does
 * -------------------
 * This file chooses the preferred advisory template from the available list.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Start with the preferred template name, then read the matcher. The matcher
 * exists because several slightly different template names can still represent
 * the same advisory format.
 *
 * When to change this file
 * ------------------------
 * Update this file when the preferred template name changes or when another
 * fallback pattern needs to be recognized.
 *
 * What this file does not do
 * --------------------------
 * This file does not fetch templates or create advisories. It only selects the
 * best matching template from an existing list.
 */

import type { Template } from '../types/template'

export const PREFERRED_ADVISORY_TEMPLATE_NAME = 'S&S Advisory'

function normalizeTemplateName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function findPreferredAdvisoryTemplate(templates: Template[]): Template | null {
  const activeTemplates = templates.filter((template) => template.active)
  const preferred = normalizeTemplateName(PREFERRED_ADVISORY_TEMPLATE_NAME)
  const brief = `${preferred} (brief)`

  return activeTemplates.find((template) => normalizeTemplateName(template.name) === preferred)
    || activeTemplates.find((template) => normalizeTemplateName(template.name) === brief)
    || activeTemplates.find((template) => {
      const name = normalizeTemplateName(template.name)
      return name.includes(preferred) && !name.includes('detailed')
    })
    || null
}
