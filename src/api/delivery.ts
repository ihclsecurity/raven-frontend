/**
 * Delivery API
 *
 * What this file does
 * -------------------
 * This file wraps the delivery routes used to send advisories, send direct
 * emails, and inspect delivery history.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Read the notification-scoped send methods first, then the history and
 * summary methods. That mirrors the way operators move through the delivery
 * screens.
 *
 * When to change this file
 * ------------------------
 * Update this file when the backend delivery workflow changes or when new
 * history filters become available.
 *
 * What this file does not do
 * --------------------------
 * This file does not decide how a delivery is composed or whether it should be
 * sent. It only sends the request.
 */

import client from './client'
import type { DeliveryBatchResponse, DeliveryHistoryFilters, DeliveryHistoryResponse, DeliveryRequest, DeliverySummaryResponse, DirectEmailRequest, NotificationDelivery } from '../types/delivery'

export const deliveryApi = {
  send: (notificationId: number, payload: DeliveryRequest) =>
    client.post<DeliveryBatchResponse>(`/notifications/${notificationId}/deliver`, payload).then((r) => r.data),
  sendDirectEmail: (notificationId: number, payload: DirectEmailRequest) =>
    client.post<NotificationDelivery>(`/notifications/${notificationId}/send-email`, payload).then((r) => r.data),
  list: (notificationId: number) =>
    client.get<NotificationDelivery[]>(`/notifications/${notificationId}/deliveries`).then((r) => r.data),
  listAll: (filters: DeliveryHistoryFilters = {}) =>
    client.get<DeliveryHistoryResponse>('/deliveries', { params: filters }).then((r) => r.data),
  summary: (filters: Pick<DeliveryHistoryFilters, 'channel' | 'status' | 'date_from' | 'date_to'> = {}) =>
    client.get<DeliverySummaryResponse>('/deliveries/summary', { params: filters }).then((r) => r.data),
}

