/**
 * Module: Deliverypanel
 * Purpose: Core module responsible for Deliverypanel concerns in this project.
 * Context: Keep this module cohesive because multiple screens and flows rely on it.
 */

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { directoryApi } from '../../api/directory'
import { deliveryApi } from '../../api/delivery'
import type { DeliveryChannel } from '../../types/delivery'
import { formatAppDateTime } from '../../utils/dateTime'

interface DeliveryPanelProps {
  notificationId: number | null
  notificationStatus: string
  approvalStatus: string
  onDelivered: () => Promise<void> | void
  disabled?: boolean
}

export function DeliveryPanel({ notificationId, notificationStatus, approvalStatus, onDelivered, disabled = false }: DeliveryPanelProps) {
  const { data: contacts } = useQuery({ queryKey: ['directory-contacts'], queryFn: () => directoryApi.listContacts(undefined, true) })
  const { data: groups } = useQuery({ queryKey: ['directory-groups'], queryFn: () => directoryApi.listGroups(true) })
  const { data: deliveries, refetch } = useQuery({
    queryKey: ['notification-deliveries', notificationId],
    queryFn: () => deliveryApi.list(notificationId as number),
    enabled: notificationId !== null,
  })

  const [channels, setChannels] = useState<DeliveryChannel[]>(['email'])
  const [contactIds, setContactIds] = useState<number[]>([])
  const [groupIds, setGroupIds] = useState<number[]>([])
  const [excludeContactIds, setExcludeContactIds] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string>('')

  useEffect(() => {
    setResult('')
  }, [notificationId])

  const statusReady = notificationStatus === 'ready' || notificationStatus === 'sent'
  const approvalReady = approvalStatus === 'approved' || approvalStatus === 'overridden'
  const canSend = Boolean(notificationId && statusReady && approvalReady)

  const availableContacts = useMemo(() => contacts || [], [contacts])
  const availableGroups = useMemo(() => groups || [], [groups])

  const toggleChannel = (channel: DeliveryChannel) => {
    setChannels((prev) => (prev.includes(channel) ? prev.filter((item) => item !== channel) : [...prev, channel]))
  }

  const send = async () => {
    if (!notificationId) return
    setBusy(true)
    setResult('')
    try {
      const response = await deliveryApi.send(notificationId, {
        channels,
        contact_ids: contactIds,
        group_ids: groupIds,
        exclude_contact_ids: excludeContactIds,
      })
      setResult(`Delivered ${response.delivered_count}; failed ${response.failed_count}`)
      await refetch()
      await onDelivered()
    } catch (error) {
      setResult(error instanceof Error ? error.message : 'Delivery failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="field-card delivery-panel">
      <div>
        <p className="field-card-title">Delivery</p>
        <div className="delivery-copy">
          Email and WhatsApp delivery are enabled in local simulated mode for Phase 2c.
        </div>
      </div>

      <div className="delivery-channel-row">
        <label className="delivery-inline-label">
          <input
            type="checkbox"
            checked={channels.includes('email')}
            onChange={() => toggleChannel('email')}
            disabled={disabled}
            className="delivery-channel-checkbox"
          />
          Email
        </label>
        <label className="delivery-inline-label">
          <input
            type="checkbox"
            checked={channels.includes('whatsapp')}
            onChange={() => toggleChannel('whatsapp')}
            disabled={disabled}
            className="delivery-channel-checkbox"
          />
          WhatsApp
        </label>
      </div>

      <label>
        Contacts
        <select
          multiple
          disabled={disabled}
          value={contactIds.map(String)}
          onChange={(e) => setContactIds(Array.from(e.target.selectedOptions).map((option) => Number(option.value)))}
          className="compose-multiselect compose-multiselect-contacts"
        >
          {availableContacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.display_name} | {contact.email}{contact.whatsapp_number ? ` | ${contact.whatsapp_number}` : ''}
            </option>
          ))}
        </select>
      </label>

      <label>
        Groups
        <select
          multiple
          disabled={disabled}
          value={groupIds.map(String)}
          onChange={(e) => setGroupIds(Array.from(e.target.selectedOptions).map((option) => Number(option.value)))}
          className="compose-multiselect compose-multiselect-groups"
        >
          {availableGroups.map((group) => (
            <option key={group.id} value={group.id}>{group.name}</option>
          ))}
        </select>
      </label>

      <label>
        Exclude Contacts From Selected Groups (optional)
        <select
          multiple
          disabled={disabled}
          value={excludeContactIds.map(String)}
          onChange={(e) => setExcludeContactIds(Array.from(e.target.selectedOptions).map((option) => Number(option.value)))}
          className="compose-multiselect compose-multiselect-groups"
        >
          {availableContacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.display_name} | {contact.email}
            </option>
          ))}
        </select>
      </label>

      <div className={`delivery-status-note${canSend ? ' is-ready' : ' is-blocked'}`}>
        {canSend ? 'Notification is approved and ready for delivery.' : 'Notification must be approved or overridden before delivery.'}
      </div>

      <div className="delivery-action-row">
        <button className="btn-primary" disabled={disabled || !canSend || channels.length === 0 || busy} onClick={() => void send()}>
          {busy ? 'Sending...' : 'Send to Selected Targets'}
        </button>
        {result ? <span className="delivery-result">{result}</span> : null}
      </div>

      {deliveries && deliveries.length > 0 ? (
        <div className="delivery-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Channel</th>
                <th>Destination</th>
                <th>Status</th>
                <th>Provider</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.slice(0, 8).map((item) => (
                <tr key={item.id}>
                  <td>{formatAppDateTime(item.sent_at, 'Pending')}</td>
                  <td>{item.channel}</td>
                  <td>{item.destination}</td>
                  <td>{item.status}</td>
                  <td>{item.provider}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

