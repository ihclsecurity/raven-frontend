/**
 * Template Query Hook
 *
 * What this file does
 * -------------------
 * This hook loads templates with React Query so screens can reuse the same
 * cache key and loading behavior when they need template data.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the active-only flag first, then the query definition. The hook is thin
 * because the real template rules live in the backend and in the selection
 * helpers.
 *
 * When to change this file
 * ------------------------
 * Update this file when the template list endpoint changes or when callers
 * need a different active/inactive filter.
 *
 * What this file does not do
 * --------------------------
 * This hook does not decide which template is preferred. It only fetches the
 * available templates.
 */

import { useQuery } from '@tanstack/react-query'
import { templatesApi } from '../api/templates'

export function useTemplates(activeOnly = true) {
  return useQuery({
    queryKey: ['templates', activeOnly],
    queryFn: () => templatesApi.list(activeOnly),
    staleTime: 5 * 60 * 1000,
  })
}

