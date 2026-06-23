/**
 * Impact Map Snapshot
 *
 * What this page does
 * -------------------
 * This page renders the map snapshot used by the email-branding pipeline.
 * It runs in a dedicated browser context so the map can be drawn, exported,
 * and returned as a PNG data URL for later embedding.
 *
 * How a new developer should read this file
 * -----------------------------------------
 * Start with the snapshot state helpers, then read the render effect, and
 * finally follow the export/ready signaling. The important logic here is the
 * lifecycle around "render map -> export PNG -> signal ready".
 *
 * When to change this file
 * ------------------------
 * Update this page when the snapshot rendering contract, map export rules, or
 * readiness signaling changes.
 *
 * What this file does not do
 * --------------------------
 * It does not decide advisory content or build the map geometry itself. It
 * only mounts the map renderer and exposes the final exported image.
 */

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { buildApiUrl } from '../api/baseUrl'
import { renderImpactMapIntoContainer, type ImpactMapPayload } from '../utils/renderImpactMapImage'

type SnapshotPayload = ImpactMapPayload & {
  title?: string
}

type SnapshotWindow = Window & {
  __impactMapSnapshotDataUrl?: string
}

// The parent process watches the document title and body markers to know when
// the export is ready or when rendering failed.
function markSnapshotReady(notificationId: number): void {
  document.body.setAttribute('data-snapshot-ready', 'true')
  document.title = `impact-map-ready-${notificationId}`
}

function markSnapshotError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  document.body.setAttribute('data-snapshot-error', message)
  document.title = 'impact-map-error'
}

function afterNextPaint(callback: () => void): void {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(callback)
  })
}

// The page renders in an isolated viewport so the export is reproducible and
// not affected by the surrounding application shell.
export default function ImpactMapSnapshotPage() {
  const [params] = useSearchParams()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const notificationId = params.get('notificationId')
  const ts = params.get('ts')
  const sig = params.get('sig')

  // The snapshot lifecycle is: clear the old state, fetch payload, render the
  // map, wait for paint, then export a PNG data URL.
  useEffect(() => {
    let cancelled = false
    let destroyMap: (() => void) | null = null

    document.body.style.margin = '0'
    document.body.style.padding = '0'
    document.body.style.overflow = 'hidden'
    document.body.style.background = '#05070b'
    document.body.removeAttribute('data-snapshot-ready')
    document.body.removeAttribute('data-snapshot-error')
    delete (window as SnapshotWindow).__impactMapSnapshotDataUrl

    const renderSnapshot = async () => {
      if (!notificationId || !ts || !sig || !containerRef.current) return
      const response = await fetch(
        buildApiUrl(`/api/notifications/impact-map-snapshot/${notificationId}?ts=${encodeURIComponent(ts)}&sig=${encodeURIComponent(sig)}`),
      )
      if (!response.ok) {
        throw new Error(`Snapshot payload request failed: ${response.status}`)
      }
      const payload = (await response.json()) as SnapshotPayload
      const rendered = await renderImpactMapIntoContainer(containerRef.current, payload, { requireBasemap: true })
      if (!rendered || cancelled) {
        rendered?.destroy()
        return
      }
      destroyMap = rendered.destroy
      afterNextPaint(() => {
        if (cancelled) return
        try {
          const dataUrl = rendered.toDataUrl()
          if (!dataUrl.startsWith('data:image/png;base64,')) {
            throw new Error('Impact map canvas export did not produce a PNG data URL')
          }
          ;(window as SnapshotWindow).__impactMapSnapshotDataUrl = dataUrl
          markSnapshotReady(payload.notification_id)
        } catch (error) {
          console.error('[impact-map-snapshot] Canvas export failed', error)
          markSnapshotError(error)
        }
      })
    }

    void renderSnapshot().catch((error) => {
      if (!cancelled) {
        console.error('[impact-map-snapshot] Render failed', error)
        markSnapshotError(error)
      }
    })

    return () => {
      cancelled = true
      destroyMap?.()
    }
  }, [notificationId, sig, ts])

  return (
    <div
      ref={containerRef}
      style={{
        width: 1000,
        height: 640,
        background: '#05070b',
      }}
    />
  )
}
