import type { CSSProperties, ReactNode } from 'react'

/**
 * Base surface primitive (skin.css .az-card). 11px radius, theme-token
 * surface/border/shadow. Compose widgets from this instead of hand-rolling
 * a `bg-zinc-900/… border …` div.
 *
 *   <Card lift ticks>…</Card>
 *
 * - `lift`  → hover raise + accent border (default on)
 * - `ticks` → corner L-bracket accents (default on)
 * - `flush` → no padding, clipped (full-bleed media)
 */
export default function Card({
  lift = true,
  ticks = true,
  flush = false,
  id,
  className = '',
  style,
  children,
}: {
  lift?: boolean
  ticks?: boolean
  flush?: boolean
  id?: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const cls = [
    'az-card',
    lift && 'az-lift',
    ticks && 'az-ticks',
    flush && 'az-card--flush',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div id={id} className={cls} style={style}>
      {children}
    </div>
  )
}
