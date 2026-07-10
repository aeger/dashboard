import type { CSSProperties } from 'react'

export type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'acc'

/**
 * Segmented meter bar — the prototype's signature progress element.
 * Track + colored fill + a dashed segment overlay (all from skin.css / --t-*).
 *
 *   <Bar pct={78} tone="warn" />
 *
 * `tone` picks the fill color token; omit for the accent color. `thresh` draws
 * a threshold marker at that percent. `thin` = 7px (default 8px).
 */
export default function Bar({
  pct,
  tone = 'acc',
  thresh,
  thin = false,
  className = '',
  style,
}: {
  pct: number
  tone?: Tone
  thresh?: number
  thin?: boolean
  className?: string
  style?: CSSProperties
}) {
  const w = Math.max(0, Math.min(100, pct))
  const fillTone = tone === 'acc' ? '' : `is-${tone}`
  return (
    <div className={`az-bar ${thin ? 'is-thin' : ''} ${className}`} style={style}>
      <div className={`az-bar__fill ${fillTone}`} style={{ width: `${w}%` }} />
      {thresh != null && (
        <div className="az-bar__thresh" style={{ left: `${Math.max(0, Math.min(100, thresh))}%` }} />
      )}
    </div>
  )
}
