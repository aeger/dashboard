'use client'

import { useWidgetData } from '@/lib/hooks/useWidgetData'
import type { HostMetrics as HostMetricsType } from '@/lib/prometheus'

type Tone = 'ok' | 'warn' | 'crit' | 'none'

// Status lives in the FIGURE and a 3px micro-bar on a neutral cell — not a
// saturated full-bleed background — so red stays rare and means something.
// Thresholds unchanged: pct green <70, amber 70–85, red ≥85; load amber ≥2, red ≥4.
function toneFor(value: number | null, type: 'pct' | 'load'): Tone {
  if (value == null) return 'none'
  if (type === 'load') return value >= 4 ? 'crit' : value >= 2 ? 'warn' : 'ok'
  return value >= 85 ? 'crit' : value >= 70 ? 'warn' : 'ok'
}

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-emerald-300',
  warn: 'text-amber-300',
  crit: 'text-red-300',
  none: 'text-zinc-100',
}
// Mark steps validated against the zinc-900 surface (CVD + contrast).
const TONE_BAR: Record<Tone, string> = {
  ok: '#059669',
  warn: '#d97706',
  crit: '#dc2626',
  none: '#3f3f46',
}

function StatTile({
  label,
  value,
  unit,
  sub,
  tone = 'none',
  barPct,
}: {
  label: string
  value: string
  unit?: string
  sub?: string
  tone?: Tone
  barPct?: number | null
}) {
  return (
    <div
      className="flex flex-col justify-between rounded-lg p-3 min-w-0 bg-zinc-800/40 border border-zinc-700/30"
      style={{ minHeight: '88px' }}
    >
      <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider truncate">{label}</div>
      <div>
        <div className="flex items-baseline gap-1">
          <span className={`text-2xl font-bold leading-none tabular-nums ${TONE_TEXT[tone]}`}>{value}</span>
          {unit && <span className="text-sm font-medium text-zinc-400">{unit}</span>}
        </div>
        {sub && <div className="text-[10px] text-zinc-500 mt-0.5 tabular-nums">{sub}</div>}
        {barPct != null && (
          <div className="h-[3px] rounded-full bg-zinc-700/60 overflow-hidden mt-2">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, barPct))}%`, background: TONE_BAR[tone] }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default function HostMetrics() {
  // Reference implementation of the shared widget data-source contract.
  const { data: metrics, loading, error } = useWidgetData<HostMetricsType[]>('/api/metrics', {
    select: (raw) => (raw as { metrics?: HostMetricsType[] }).metrics ?? [],
  })

  // Error check MUST precede the null-data spinner: on a failing endpoint the hook
  // never sets data, so checking `data == null` first spins forever.
  if (error && metrics == null) return (
    <div className="text-xs text-red-400/80 text-center py-6">Host metrics unavailable</div>
  )

  if (loading || metrics == null) return (
    <div className="flex items-center justify-center h-24">
      <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
    </div>
  )

  if (metrics.length === 0) return (
    <div className="text-zinc-500 text-sm text-center py-6">Prometheus not configured</div>
  )

  return (
    <div className="space-y-4">
      {metrics.map((host) => {
        const uptimeDays = host.uptime_days != null
          ? `${host.uptime_days.toFixed(2)} days`
          : '—'
        const ramUsed = host.ram_used_gb != null ? `${host.ram_used_gb} GiB` : '—'
        const ramPct = host.ram_used_percent != null ? host.ram_used_percent.toFixed(1) : '—'
        const cpuPct = host.cpu_percent != null ? host.cpu_percent.toFixed(2) : '—'
        const diskPct = host.disk_used_percent != null ? host.disk_used_percent.toFixed(1) : '—'
        const load1m = host.load_1m != null ? host.load_1m.toFixed(2) : '—'

        return (
          <div key={host.instance}>
            {metrics.length > 1 && (
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-xs font-semibold text-zinc-400">{host.name}</span>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
              <StatTile
                label="CPU Usage"
                value={cpuPct}
                unit="%"
                tone={toneFor(host.cpu_percent, 'pct')}
                barPct={host.cpu_percent}
              />
              <StatTile
                label="RAM Usage"
                value={ramPct}
                unit="%"
                tone={toneFor(host.ram_used_percent, 'pct')}
                barPct={host.ram_used_percent}
              />
              <StatTile
                label="RAM Used"
                value={ramUsed}
                tone={toneFor(host.ram_used_percent, 'pct')}
              />
              <StatTile
                label="Load Avg (1m)"
                value={load1m}
                tone={toneFor(host.load_1m, 'load')}
                barPct={host.load_1m != null ? (host.load_1m / 4) * 100 : null}
              />
              <StatTile label="Uptime" value={uptimeDays} />
              <StatTile
                label="Root Disk Usage"
                value={diskPct}
                unit="%"
                tone={toneFor(host.disk_used_percent, 'pct')}
                barPct={host.disk_used_percent}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
