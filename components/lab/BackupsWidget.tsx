'use client'

import { useEffect, useState } from 'react'
import type { BackupStatus } from '@/app/api/backups/route'

const HEALTH_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
  ok:              { badge: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50', dot: 'bg-emerald-400',                   label: 'OK' },
  overdue:         { badge: 'bg-amber-900/40 text-amber-300 border-amber-700/40',       dot: 'bg-amber-400 animate-pulse',       label: 'Overdue' },
  failed:          { badge: 'bg-red-900/50 text-red-300 border-red-700/50',             dot: 'bg-red-400 animate-pulse',         label: 'Failed' },
  never_succeeded: { badge: 'bg-red-900/50 text-red-300 border-red-700/50',             dot: 'bg-red-400 animate-pulse',         label: 'No data' },
}

function fmtAge(iso: string | null): string {
  if (!iso) return 'never'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86_400)}d ago`
}

function fmtBytes(b: number | null): string {
  if (b == null) return '—'
  if (b < 1024) return `${b}B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}K`
  if (b < 1024 * 1024 * 1024) return `${(b / 1_048_576).toFixed(1)}M`
  return `${(b / 1_073_741_824).toFixed(2)}G`
}

export default function BackupsWidget() {
  const [backups, setBackups] = useState<BackupStatus[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function poll() {
      try {
        const res = await fetch('/api/backups')
        const data = await res.json()
        if (mounted) setBackups(data.backups ?? [])
      } catch {}
      if (mounted) setLoading(false)
    }
    poll()
    const iv = setInterval(poll, 60_000)
    return () => { mounted = false; clearInterval(iv) }
  }, [])

  const worst = backups.some((b) => ['failed', 'never_succeeded'].includes(b.health))
    ? 'red'
    : backups.some((b) => b.health === 'overdue')
      ? 'amber'
      : 'green'
  const accent = worst === 'red' ? '#ef4444' : worst === 'amber' ? '#f59e0b' : '#34d399'

  return (
    <div>
      <div
        className="w-1 absolute left-0 top-4 bottom-4 rounded-full"
        style={{ marginLeft: '-1px', background: `${accent}99` }}
      />
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">Backups (R2)</h2>
        <span className="text-[10px] text-zinc-700">az-lab-backups</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-16">
          <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
        </div>
      ) : backups.length === 0 ? (
        <p className="text-xs text-zinc-600 text-center py-4">No backup data</p>
      ) : (
        <div className="space-y-2">
          {backups.map((b) => {
            const style = HEALTH_STYLE[b.health] ?? HEALTH_STYLE.never_succeeded
            return (
              <div key={b.name} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
                  <span className="text-xs text-zinc-300 truncate">{b.name}</span>
                  <span className="text-[10px] text-zinc-700 uppercase">{b.cadence}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-zinc-600 hidden sm:block">
                    {fmtBytes(b.last_success_bytes ?? b.last_bytes)}
                  </span>
                  <span className="text-[10px] text-zinc-600">{fmtAge(b.last_success_at)}</span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide ${style.badge}`}
                  >
                    {style.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
