import Link from 'next/link'
import type { ReactNode } from 'react'

/** Shared card chrome for every lab tile. Kept in sync with the family cards. */
const CARD = 'relative card-lift bg-zinc-900/50 border border-zinc-800/70 rounded-xl p-4'

export function ExpandLink({ href, label = '↗ expand' }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="text-[10px] font-semibold text-zinc-600 hover:text-zinc-300 uppercase tracking-widest transition-colors"
    >
      {label}
    </Link>
  )
}

export interface LabTileProps {
  /** DOM id — used for in-page anchors (e.g. StatusPills → #security). */
  id?: string
  /** Header label. Omit (or set `bare`) for widgets that render their own header. */
  title?: string
  /** Tailwind text-color class for the header label. */
  accent?: string
  /** If set, renders an "expand" link to a detail route in the header. */
  expandHref?: string
  /** Skip the standard header row — the widget draws its own card header. */
  bare?: boolean
  className?: string
  children: ReactNode
}

/**
 * Presentational wrapper that provides the standard card chrome + header row.
 * Server-compatible (no hooks). See docs/widgets.md for the widget contract.
 */
export default function LabTile({
  id,
  title,
  accent = 'text-zinc-600',
  expandHref,
  bare = false,
  className = '',
  children,
}: LabTileProps) {
  return (
    <div id={id} className={`${CARD} ${className}`}>
      {!bare && title && (
        <div className="flex items-center justify-between mb-3">
          <h2 className={`text-[10px] font-semibold ${accent} uppercase tracking-widest`}>{title}</h2>
          {expandHref && <ExpandLink href={expandHref} />}
        </div>
      )}
      {children}
    </div>
  )
}
