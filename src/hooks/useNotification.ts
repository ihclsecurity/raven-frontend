/**
 * Notification Query Hook
 *
 * What this file does
 * -------------------
 * This hook loads a single notification by id through React Query so screens
 * can share the same caching and loading behavior.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Start with the query key, then the fetch function, then the enabled guard.
 * The enabled guard is what keeps the hook safe when no notification id exists.
 *
 * When to change this file
 * ------------------------
 * Update this file when the notification fetch shape changes or when the cache
 * key needs to incorporate more context.
 *
 * What this file does not do
 * --------------------------
 * This hook does not transform the notification. It only exposes the fetched
 * record to the caller.
 */

import { useQuery } from '@tanstack/react-query'
import { notificationsApi } from '../api/notifications'

export function useNotification(notificationId: number | null) {
  return useQuery({
    queryKey: ['notification', notificationId],
    queryFn: () => notificationsApi.get(notificationId as number),
    enabled: notificationId !== null,
  })
}

