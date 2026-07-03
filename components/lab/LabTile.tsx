'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'

/** Shared card chrome for every lab tile. Kept in sync with the family cards. */
const CARD = 'relative card-lift bg-zinc-900/50 border border-zinc-800/70 rounded-xl p-4'

/**
 * Tailwind needs static class names — map the registry `span` to literal classes.
 * Spans apply at lg+; below that every tile stacks full-width (matches old layout).
 */
const SPAN_CLASS: Record<number, string> = {
  4: 'lg:col-span-4',
  5: 'lg:col-span-5',
  6: 'lg:col-span-6',
  7: 'lg:col-span-7',
  8: 'lg:col-span-8',
  12: 'lg:col-span-12',
}

export function ExpandLink({ href, label = '⤢' }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      title="open full page"
      className="text-[11px] font-semibold text-zinc-600 hover:text-zinc-300 uppercase tracking-widest transition-colors px-1"
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
  /** If set, renders a "⤢" deep link to a full detail route in the header. */
  expandHref?: string
  /** Grid columns at lg+ (4/5/6/7/8/12). Default 12 (full width). */
  span?: number
  /** In-place expand content — revealed inline below the widget, no navigation.
   *  A rendered node (not a component type) so the server page can pass it. */
  detail?: ReactNode
  /** Label for the in-place expand toggle (e.g. "history", "all monitors"). */
  detailLabel?: string
  /** Skip the standard header row — the widget draws its own card header. */
  bare?: boolean
  className?: string
  children: ReactNode
}

/**
 * Card wrapper providing chrome + header + grid span + in-place expansion.
 * Expanding grows the tile to the full row and reveals `detail` inline
 * (animated via grid-template-rows 0fr→1fr — no JS height measuring).
 * The detail component mounts on first expand and stays mounted after, so
 * self-fetching detail widgets (charts) don't refetch on every toggle.
 * See docs/widgets.md for the widget contract.
 */
export default function LabTile({
  id,
  title,
  accent = 'text-zinc-600',
  expandHref,
  span = 12,
  detail,
  detailLabel = 'expand',
  bare = false,
  className = '',
  children,
}: LabTileProps) {
  const [expanded, setExpanded] = useState(false)
  const [everExpanded, setEverExpanded] = useState(false)

  const toggle = () => {
    setExpanded((v) => !v)
    setEverExpanded(true)
  }

  const spanClass = expanded ? 'lg:col-span-12' : (SPAN_CLASS[span] ?? 'lg:col-span-12')

  return (
    <div id={id} className={`${CARD} ${spanClass} min-w-0 ${className}`}>
      {!bare && title && (
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className={`text-[10px] font-semibold ${accent} uppercase tracking-widest`}>{title}</h2>
          <div className="flex items-center gap-1">
            {detail != null && (
              <button
                onClick={toggle}
                aria-expanded={expanded}
                className="flex items-center gap-1 text-[10px] font-semibold text-zinc-600 hover:text-violet-300 uppercase tracking-widest transition-colors px-1.5 py-0.5 rounded hover:bg-violet-500/10"
              >
                {detailLabel}
                <span
                  className="text-[8px] transition-transform duration-200"
                  style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
                >
                  ▼
                </span>
              </button>
            )}
            {expandHref && <ExpandLink href={expandHref} />}
          </div>
        </div>
      )}
      {children}
      {detail != null && everExpanded && (
        <div
          className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
          style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
        >
          <div className="overflow-hidden min-w-0">
            <div className="pt-4 mt-4 border-t border-dashed border-zinc-800/60">{detail}</div>
          </div>
        </div>
      )}
    </div>
  )
}
