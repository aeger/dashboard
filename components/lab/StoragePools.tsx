'use client'

import { useWidgetData } from '@/lib/hooks/useWidgetData'
import { useTileMeta } from '@/components/lab/LabTile'
import type { StoragePool } from '@/lib/prometheus'

// Same thresholds as the host stat cells: green <70, amber 70–85, red ≥85.
// Marks validated against the zinc-900 surface; text one step brighter.
function tone(pct: number | null): { bar: string; text: string } {
  if (pct == null) return { bar: '#3f3f46', text: 'text-zinc-500' }
  if (pct >= 85) return { bar: '#dc2626', text: 'text-red-300' }
  if (pct >= 70) return { bar: '#d97706', text: 'text-amber-300' }
  return { bar: '#059669', text: 'text-zinc-300' }
}

function fmtSize(gb: number | null): string {
  if (gb == null) return '?'
  return gb >= 1024 ? `${(gb / 1024).toFixed(1)}T` : `${Math.round(gb)}G`
}

function fmtBytes(b: number): string {
  if (b >= 1024 ** 4) return `${(b / 1024 ** 4).toFixed(2)}T`
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)}G`
  if (b >= 1024 ** 2) return `${Math.round(b / 1024 ** 2)}M`
  return `${Math.round(b / 1024)}K`
}

interface ZfsDataset {
  name: string
  pool: string
  dstype: string
  used_bytes: number
  available_bytes: number
  referenced_bytes: number
}

/**
 * In-place expand: per-dataset ZFS breakdown from the MS-01 textfile collector
 * (mockup "datasets" reveal). Grouped by pool, child datasets indented.
 */
export function StorageDatasets() {
  const { data, loading, error } = useWidgetData<ZfsDataset[]>('/api/storage/datasets', {
    intervalMs: 60000,
    select: (raw) => (raw as { datasets?: ZfsDataset[] }).datasets ?? [],
  })

  if (error && data == null) return <div className="text-xs text-red-400/80">Dataset metrics unavailable</div>
  if (loading || data == null) return <div className="text-xs text-zinc-600">Loading…</div>
  if (data.length === 0) return <div className="text-xs text-zinc-600">No dataset metrics — collector on MS-01 may be down</div>

  const pools = [...new Set(data.map((d) => d.pool))]

  return (
    <div className="flex flex-col gap-3">
      {pools.map((pool) => (
        <div key={pool}>
          <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">{pool}</div>
          <div className="flex flex-col">
            {data
              .filter((d) => d.pool === pool)
              .map((d) => {
                const child = d.name.includes('/')
                return (
                  <div
                    key={d.name}
                    className="flex items-center gap-2 py-1 border-b border-zinc-800/30 last:border-0 min-w-0 text-xs"
                  >
                    <span className={`truncate ${child ? 'pl-3 text-zinc-400' : 'font-medium text-zinc-300'}`}>
                      {child ? d.name.slice(d.pool.length + 1) : d.name}
                    </span>
                    {d.dstype === 'volume' && (
                      <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 shrink-0">
                        zvol
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-3 shrink-0 tabular-nums text-[11px]">
                      <span className="text-zinc-400">{fmtBytes(d.used_bytes)} used</span>
                      <span className="text-zinc-600 hidden sm:inline">{fmtBytes(d.referenced_bytes)} ref</span>
                      <span className="text-zinc-600">{fmtBytes(d.available_bytes)} avail</span>
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function StoragePools() {
  const { data: pools, loading, error } = useWidgetData<StoragePool[]>('/api/storage', {
    select: (raw) => (raw as { pools?: StoragePool[] }).pools ?? [],
  })
  useTileMeta(pools?.length ? `proxmox · ${pools.length} pools` : undefined)

  if (error && pools == null) return <div className="text-xs text-red-400/80">Storage metrics unavailable</div>
  if (loading || pools == null) return <div className="text-xs text-zinc-600">Loading…</div>
  if (pools.length === 0) return <div className="text-xs text-zinc-600">No storage data</div>

  return (
    <div className="flex flex-col">
      {pools.map((p) => {
        const pct = p.used_percent ?? 0
        const t = tone(p.used_percent)
        return (
          <div key={p.id} className="min-w-0 py-1.5 border-b border-zinc-800/30 last:border-0 last:pb-0 first:pt-0">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-zinc-300 truncate">{p.name}</span>
              <span className="text-[11px] text-zinc-500 shrink-0 tabular-nums">
                {p.used_gb != null && p.size_gb != null && (
                  <span className="mr-1.5">{fmtSize(p.used_gb)} / {fmtSize(p.size_gb)} ·</span>
                )}
                <span className={`font-semibold ${t.text}`}>{pct.toFixed(1)}%</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800/80 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, pct)}%`, background: t.bar }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
