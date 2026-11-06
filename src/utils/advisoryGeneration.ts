const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

export function getAdvisoryGenerationValidationError(fields: Record<string, unknown>): string | null {
  if (!text(fields.heading)) return 'Enter a notification heading before generating the advisory.'
  if (!text(fields.source_text)) return 'Enter source intelligence before generating the advisory.'
  const templateId = Number(fields.template_id)
  if (!Number.isInteger(templateId) || templateId <= 0) return 'Select a template before generating the advisory.'
  return null
}

export function getAdvisoryGenerationError(error: unknown, timedOut = false): string {
  const apiError = error as { isTimeout?: boolean; code?: string } | null
  if (timedOut || apiError?.isTimeout || apiError?.code === 'ECONNABORTED' || apiError?.code === 'ETIMEDOUT') {
    return 'Advisory generation timed out. Your draft has been kept. Check the LLM connection in Settings, then try again.'
  }
  return error instanceof Error ? error.message : 'Failed to generate the advisory. Please try again.'
}
