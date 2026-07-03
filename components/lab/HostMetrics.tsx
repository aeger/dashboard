'use client'

import { useWidgetData } from '@/lib/hooks/useWidgetData'
import { useTileMeta } from '@/components/lab/LabTile'
import type { HostMetrics as HostMetricsType } from '@/lib/prometheus'

/** Compact CPU-over-last-hour sparkline in a stat cell (12 × 5-min samples). */
function CpuSparkCell() {
  const { data: points } = useWidgetData<{ t: number; v: number }[]>('/api/metrics/history', {
    intervalMs: 60000,
    select: (raw) => ((raw as { cpu?: { t: number; v: number }[] }).cpu ?? []).slice(-12),
  })
  const last = points?.length ? points[points.length - 1].v : null

  let svg: React.ReactNode = null
  if (points && points.length > 1) {
    const W = 100
    const H = 26
    const max = Math.max(...points.map((p) => p.v), 1) * 1.15
    const pts = points.map((p, i) => [
      (i / (points.length - 1)) * W,
      H - 2 - (p.v / max) * (H - 5),
    ])
    const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
    const area = `M0,${H} L${line.split(' ').join(' L')} L${W},${H} Z`
    svg = (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-7 mt-1">
        <path d={area} fill="rgba(139,92,246,0.12)" />
        <polyline points={line} fill="none" stroke="#8b5cf6" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.2" fill="#a78bfa" />
      </svg>
    )
  }

  return (
    <div
      className="flex flex-col justify-between rounded-lg p-3 min-w-0 bg-zinc-800/40 border border-zinc-700/30"
      style={{ minHeight: '88px' }}
    >
      <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider truncate">CPU · 1h</div>
      <div>
        <span className="text-sm font-semibold text-zinc-300 tabular-nums">
          {last != null ? `${last.toFixed(1)}%` : '—'}
        </span>
        {svg}
      </div>
    </div>
  )
}

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

  // Surface host + uptime as the tile-header context line (mockup pattern).
  const first = metrics?.[0]
  useTileMeta(
    first
      ? `${first.name}${first.uptime_days != null ? ` · up ${first.uptime_days.toFixed(1)}d` : ''}`
      : undefined,
  )

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
      {metrics.map((host, hostIdx) => {
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
              {/* First host: uptime lives in the header meta; the cell becomes a
                  CPU-over-1h sparkline. Extra hosts keep the plain uptime cell. */}
              {hostIdx === 0 ? <CpuSparkCell /> : <StatTile label="Uptime" value={uptimeDays} />}
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
