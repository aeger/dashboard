'use client'

import { useWidgetData } from '@/lib/hooks/useWidgetData'
import { useTileMeta } from '@/components/lab/LabTile'
import Bar from '@/components/ui/Bar'
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

// Inner metric cell = the .az-tile primitive (recessed surf2 surface, bord2
// edge) so each stat reads distinct from the card frame in every theme.
const CELL = 'az-tile flex flex-col justify-between min-w-0'

function fmtRate(bps: number | null): string {
  if (bps == null) return '—'
  if (bps >= 1_048_576) return `${(bps / 1_048_576).toFixed(1)} MB/s`
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`
  return `${Math.round(bps)} B/s`
}

function fmtGiB(gb: number | null): string {
  if (gb == null) return '?'
  return gb >= 1024 ? `${(gb / 1024).toFixed(1)}T` : gb >= 100 ? `${Math.round(gb)}` : `${gb.toFixed(1)}`
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
    <div className={CELL} style={{ minHeight: '88px' }}>
      <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider truncate">{label}</div>
      <div>
        <div className="flex items-baseline gap-1">
          <span className={`text-2xl font-bold leading-none tabular-nums ${TONE_TEXT[tone]}`}>{value}</span>
          {unit && <span className="text-sm font-medium text-zinc-400">{unit}</span>}
        </div>
        {barPct != null && (
          <Bar
            pct={barPct}
            tone={tone === 'warn' ? 'warn' : tone === 'crit' ? 'crit' : 'acc'}
            thin
            className="mt-2"
          />
        )}
        {sub && <div className="text-[10px] text-zinc-500 mt-1.5 tabular-nums truncate">{sub}</div>}
      </div>
    </div>
  )
}

/** Sparkline stat cell — violet line + soft area + endpoint dot (mockup style). */
function SparkCell({
  label,
  value,
  sub,
  points,
}: {
  label: string
  value: string
  sub?: string
  points: { t: number; v: number }[] | null
}) {
  let svg: React.ReactNode = null
  if (points && points.length > 1) {
    const W = 100
    const H = 26
    const max = Math.max(...points.map((p) => p.v), 0.001) * 1.15
    const pts = points.map((p, i) => [
      (i / (points.length - 1)) * W,
      H - 2 - (p.v / max) * (H - 5),
    ])
    const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
    const area = `M0,${H} L${line.split(' ').join(' L')} L${W},${H} Z`
    svg = (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-6 mt-1">
        <path d={area} fill="rgba(139,92,246,0.12)" />
        <polyline points={line} fill="none" stroke="#8b5cf6" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.2" fill="#a78bfa" />
      </svg>
    )
  }

  return (
    <div className={CELL} style={{ minHeight: '88px' }}>
      <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider truncate">{label}</div>
      <div>
        <span className="text-sm font-semibold text-zinc-300 tabular-nums">{value}</span>
        {sub && <span className="text-[10px] text-zinc-500 tabular-nums ml-1.5">{sub}</span>}
        {svg}
      </div>
    </div>
  )
}

interface HistoryPoint { t: number; v: number }
interface History { cpu: HistoryPoint[]; net: HistoryPoint[] }

export default function HostMetrics() {
  // Reference implementation of the shared widget data-source contract.
  const { data: metrics, loading, error } = useWidgetData<HostMetricsType[]>('/api/metrics', {
    select: (raw) => (raw as { metrics?: HostMetricsType[] }).metrics ?? [],
  })
  // 1h sparklines for the first host (12 × 5-min samples from the 12h history).
  const { data: history } = useWidgetData<History>('/api/metrics/history', {
    intervalMs: 60000,
    select: (raw) => {
      const r = raw as { cpu?: HistoryPoint[]; net?: HistoryPoint[] }
      return { cpu: (r.cpu ?? []).slice(-12), net: (r.net ?? []).slice(-12) }
    },
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
        const netTotal = host.net_rx_bytes != null || host.net_tx_bytes != null
          ? (host.net_rx_bytes ?? 0) + (host.net_tx_bytes ?? 0)
          : null

        return (
          <div key={host.instance}>
            {metrics.length > 1 && (
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-xs font-semibold text-zinc-400">{host.name}</span>
              </div>
            )}
            {/* Mockup cell set: CPU · RAM · Load 1m · Root disk · Net ↓/↑ · CPU 1h */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
              <StatTile
                label="CPU"
                value={host.cpu_percent != null ? host.cpu_percent.toFixed(1) : '—'}
                unit="%"
                tone={toneFor(host.cpu_percent, 'pct')}
                barPct={host.cpu_percent}
              />
              <StatTile
                label="RAM"
                value={host.ram_used_percent != null ? host.ram_used_percent.toFixed(1) : '—'}
                unit="%"
                tone={toneFor(host.ram_used_percent, 'pct')}
                barPct={host.ram_used_percent}
                sub={host.ram_used_gb != null && host.ram_total_gb != null
                  ? `${fmtGiB(host.ram_used_gb)} / ${fmtGiB(host.ram_total_gb)} GiB`
                  : undefined}
              />
              <StatTile
                label="Load 1m"
                value={host.load_1m != null ? host.load_1m.toFixed(2) : '—'}
                tone={toneFor(host.load_1m, 'load')}
                barPct={host.load_1m != null && host.cpu_count != null
                  ? (host.load_1m / host.cpu_count) * 100
                  : host.load_1m != null ? (host.load_1m / 4) * 100 : null}
                sub={host.cpu_count != null ? `${host.cpu_count} vCPU` : undefined}
              />
              <StatTile
                label="Root disk"
                value={host.disk_used_percent != null ? host.disk_used_percent.toFixed(1) : '—'}
                unit="%"
                tone={toneFor(host.disk_used_percent, 'pct')}
                barPct={host.disk_used_percent}
                sub={host.disk_used_gb != null && host.disk_total_gb != null
                  ? `${Math.round(host.disk_used_gb)} / ${Math.round(host.disk_total_gb)} GB`
                  : undefined}
              />
              {hostIdx === 0 ? (
                <>
                  <SparkCell
                    label="Net ↓/↑"
                    value={fmtRate(netTotal)}
                    sub={`↓${fmtRate(host.net_rx_bytes)} ↑${fmtRate(host.net_tx_bytes)}`}
                    points={history?.net ?? null}
                  />
                  <SparkCell
                    label="CPU · 1h"
                    value={history?.cpu?.length ? `${history.cpu[history.cpu.length - 1].v.toFixed(1)}%` : '—'}
                    points={history?.cpu ?? null}
                  />
                </>
              ) : (
                <>
                  <StatTile
                    label="Net ↓/↑"
                    value={fmtRate(netTotal)}
                    sub={`↓${fmtRate(host.net_rx_bytes)} ↑${fmtRate(host.net_tx_bytes)}`}
                  />
                  <StatTile label="Uptime" value={host.uptime_days != null ? `${host.uptime_days.toFixed(1)}d` : '—'} />
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
