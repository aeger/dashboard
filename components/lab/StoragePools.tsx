'use client'

import { useWidgetData } from '@/lib/hooks/useWidgetData'
import type { StoragePool } from '@/lib/prometheus'

// green < 70, amber 70-85, red > 85 — matches HostMetrics tileColor thresholds
function barColor(pct: number | null): string {
  if (pct == null) return 'rgba(39,39,42,0.8)'
  if (pct >= 90) return 'rgba(220,38,38,0.9)'
  if (pct >= 80) return 'rgba(217,119,6,0.9)'
  if (pct >= 70) return 'rgba(202,138,4,0.8)'
  return 'rgba(22,163,74,0.8)'
}

export default function StoragePools() {
  const { data: pools, loading, error } = useWidgetData<StoragePool[]>('/api/storage', {
    select: (raw) => (raw as { pools?: StoragePool[] }).pools ?? [],
  })

  if (error && pools == null) return <div className="text-xs text-red-400/80">Storage metrics unavailable</div>
  if (loading || pools == null) return <div className="text-xs text-zinc-600">Loading…</div>
  if (pools.length === 0) return <div className="text-xs text-zinc-600">No storage data</div>

  return (
    <div className="flex flex-col gap-2.5">
      {pools.map((p) => {
        const pct = p.used_percent ?? 0
        return (
          <div key={p.id} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-zinc-300 truncate">{p.name}</span>
              <span className="text-[11px] text-zinc-500 shrink-0 tabular-nums">
                {p.used_gb != null && p.size_gb != null && (
                  <span className="mr-2">
                    {p.used_gb >= 1024 ? `${(p.used_gb / 1024).toFixed(1)}T` : `${p.used_gb}G`} /{' '}
                    {p.size_gb >= 1024 ? `${(p.size_gb / 1024).toFixed(1)}T` : `${p.size_gb}G`}
                  </span>
                )}
                <span className="font-semibold text-zinc-300">{pct.toFixed(1)}%</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-zinc-800/80 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, pct)}%`, background: barColor(p.used_percent) }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
