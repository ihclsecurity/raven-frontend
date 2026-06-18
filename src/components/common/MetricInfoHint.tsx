/**
 * Metric Info Hint
 *
 * This component provides the small inline help trigger used next to dashboard
 * metrics when the number needs a short explanation.
 *
 * It is responsible for:
 * - toggling a compact tooltip-like explanation
 * - closing itself when the user clicks outside the component
 * - keeping metric labels readable without adding clutter
 *
 * What this file does not do:
 * - it does not calculate the metric itself
 * - it does not manage larger help or onboarding flows
 */
import { useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'

type MetricInfoHintProps = {
  text: string
}

export function MetricInfoHint({ text }: MetricInfoHintProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div ref={rootRef} className="metric-info-hint">
      <button
        type="button"
        className={`metric-info-hint-btn${open ? ' is-open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Metric info"
      >
        <Info size={13} />
      </button>
      {open ? <div className="metric-info-hint-pop">{text}</div> : null}
    </div>
  )
}
