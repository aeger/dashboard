import type { ReactNode } from 'react'

/**
 * Big thin-numeral metric value with optional unit (skin.css .az-metric).
 *
 *   <Metric value="47.0" unit="d" size="lg" />
 */
export default function Metric({
  value,
  unit,
  size = 'md',
  className = '',
  color,
}: {
  value: ReactNode
  unit?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
  /** Override numeral color (e.g. a tone token var). */
  color?: string
}) {
  const sizeCls = size === 'sm' ? 'az-metric--sm' : size === 'lg' ? 'az-metric--lg' : ''
  return (
    <span className={`inline-flex items-baseline gap-0.5 ${className}`}>
      <span className={`az-metric ${sizeCls}`} style={color ? { color } : undefined}>
        {value}
      </span>
      {unit != null && <span className="az-meta">{unit}</span>}
    </span>
  )
}
