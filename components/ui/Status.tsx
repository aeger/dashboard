import { statusGlyph, statusLabel, type Tone as StatusTone } from '@/lib/colorThemes'

/**
 * Status primitives — shape carries meaning (CVD-safe), color is the tone token.
 * ● UP (ok) · ▲ WARN (warn) · ■ DOWN (crit) · ◆ INFO (info) · ○ IDLE (idle)
 */

/** Just the colored shape glyph. */
export function StatusGlyph({ tone, className = '' }: { tone: StatusTone; className?: string }) {
  return (
    <span className={`az-glyph is-${tone} ${className}`} aria-hidden>
      {statusGlyph[tone]}
    </span>
  )
}

/** Soft status chip: glyph + label on a tinted background. */
export function StatusChip({
  tone,
  label,
  className = '',
}: {
  tone: Exclude<StatusTone, 'idle'>
  label?: string
  className?: string
}) {
  return (
    <span className={`az-chip is-${tone} ${className}`}>
      <span aria-hidden>{statusGlyph[tone]}</span>
      {label ?? statusLabel[tone]}
    </span>
  )
}

/** KPI pill for the top signal row: glyph + uppercase label + value. */
export function SignalPill({
  tone,
  label,
  value,
  className = '',
}: {
  tone: StatusTone
  label: string
  value: React.ReactNode
  className?: string
}) {
  return (
    <div className={`az-pill az-lift ${className}`}>
      <StatusGlyph tone={tone} />
      <span className="az-pill__label">{label}</span>
      <span className="az-pill__val">{value}</span>
    </div>
  )
}
