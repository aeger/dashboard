'use client'

import { useEffect, useState } from 'react'
import { StatusChip, StatusDot, type StatusTone } from '@/components/lab/Status'
import type { BackupStatus } from '@/app/api/backups/route'

const HEALTH_STYLE: Record<string, { tone: StatusTone; pulse: boolean; label: string }> = {
  ok:              { tone: 'ok',   pulse: false, label: 'OK' },
  overdue:         { tone: 'warn', pulse: true,  label: 'Overdue' },
  failed:          { tone: 'crit', pulse: true,  label: 'Failed' },
  never_succeeded: { tone: 'crit', pulse: true,  label: 'No data' },
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
                  <StatusDot tone={style.tone} pulse={style.pulse} />
                  <span className="text-xs text-zinc-300 truncate">{b.name}</span>
                  <span className="text-[10px] text-zinc-700 uppercase">{b.cadence}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-zinc-600 hidden sm:block tabular-nums">
                    {fmtBytes(b.last_success_bytes ?? b.last_bytes)}
                  </span>
                  <span className="text-[10px] text-zinc-600 tabular-nums">{fmtAge(b.last_success_at)}</span>
                  <StatusChip tone={style.tone}>{style.label}</StatusChip>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
