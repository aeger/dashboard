'use client'

import { useEffect, useState } from 'react'
import type { HostMetrics as HostMetricsType } from '@/lib/prometheus'

// ── Ring gauge (SVG) ──────────────────────────────────────────────────────────
function RingGauge({
  value,
  label,
  detail,
  size = 72,
}: {
  value: number | null
  label: string
  detail?: string
  size?: number
}) {
  const r = (size - 12) / 2
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r
  const pct = value != null ? Math.min(100, Math.max(0, value)) : 0
  const filled = (pct / 100) * circ

  const color =
    value == null ? '#3f3f46'
    : value >= 90  ? '#ef4444'
    : value >= 75  ? '#f59e0b'
    : value >= 50  ? '#6366f1'
    : '#22c55e'

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#27272a" strokeWidth="6" />
        {/* Fill */}
        {value != null && (
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circ}`}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )}
        {/* Center label */}
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="13" fontWeight="600" fill={value != null ? 'white' : '#52525b'}>
          {value != null ? `${Math.round(value)}%` : '—'}
        </text>
      </svg>
      <div className="text-center">
        <div className="text-xs text-zinc-400">{label}</div>
        {detail && <div className="text-[10px] text-zinc-600 leading-tight">{detail}</div>}
      </div>
    </div>
  )
}

// ── Network throughput bar ────────────────────────────────────────────────────
function NetBar({ rx, tx }: { rx: number | null; tx: number | null }) {
  const fmt = (b: number | null) => {
    if (b == null) return '—'
    if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB/s`
    if (b >= 1024) return `${(b / 1024).toFixed(0)} KB/s`
    return `${Math.round(b)} B/s`
  }

  const maxVal = Math.max(rx ?? 0, tx ?? 0, 1)
  const rxPct = rx != null ? Math.min(100, (rx / maxVal) * 100) : 0
  const txPct = tx != null ? Math.min(100, (tx / maxVal) * 100) : 0

  return (
    <div className="bg-zinc-800/50 rounded-lg p-2.5 space-y-1.5">
      <div className="text-xs text-zinc-500 mb-1">Network</div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-indigo-400 w-3">↓</span>
          <div className="flex-1 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${rxPct}%` }} />
          </div>
          <span className="text-[10px] text-zinc-400 w-16 text-right">{fmt(rx)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-amber-400 w-3">↑</span>
          <div className="flex-1 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
            <div className="h-full rounded-full bg-amber-500" style={{ width: `${txPct}%` }} />
          </div>
          <span className="text-[10px] text-zinc-400 w-16 text-right">{fmt(tx)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Load indicator ────────────────────────────────────────────────────────────
function LoadBadge({ load, cores = 1 }: { load: number | null; cores?: number }) {
  if (load == null) return null
  const pct = Math.min(100, (load / cores) * 100)
  const color = pct >= 90 ? 'text-red-400' : pct >= 60 ? 'text-amber-400' : 'text-green-400'
  return (
    <div className="bg-zinc-800/50 rounded-lg p-2.5 flex items-center justify-between">
      <span className="text-xs text-zinc-500">Load (1m)</span>
      <span className={`text-sm font-semibold ${color}`}>{load.toFixed(2)}</span>
    </div>
  )
}

// ── Uptime chip ───────────────────────────────────────────────────────────────
function UptimeChip({ days }: { days: number | null }) {
  if (days == null) return null
  const d = Math.floor(days)
  const h = Math.floor((days - d) * 24)
  return (
    <div className="bg-zinc-800/50 rounded-lg p-2.5 flex items-center justify-between">
      <span className="text-xs text-zinc-500">Uptime</span>
      <span className="text-sm font-semibold text-zinc-200">{d}d {h}h</span>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function HostMetrics() {
  const [metrics, setMetrics] = useState<HostMetricsType[]>([])
  const [loading, setLoading] = useState(true)

  const load = () =>
    fetch('/api/metrics')
      .then((r) => r.json())
      .then((d) => setMetrics(d.metrics ?? []))
      .catch(() => {})

  useEffect(() => {
    load().finally(() => setLoading(false))
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-24">
      <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
    </div>
  )

  if (metrics.length === 0) return (
    <div className="text-zinc-500 text-sm text-center py-6">Prometheus not configured</div>
  )

  return (
    <div className="space-y-5">
      {metrics.map((host) => (
        <div key={host.instance} className="space-y-3">
          {/* Host name */}
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span className="text-sm font-semibold text-zinc-200">{host.name}</span>
          </div>

          {/* Ring gauges */}
          <div className="flex justify-around">
            <RingGauge
              value={host.cpu_percent}
              label="CPU"
            />
            <RingGauge
              value={host.ram_used_percent}
              label="RAM"
              detail={host.ram_used_gb != null && host.ram_total_gb != null
                ? `${host.ram_used_gb} / ${host.ram_total_gb} GB`
                : undefined}
            />
            <RingGauge
              value={host.disk_used_percent}
              label="Disk"
              detail={host.disk_used_gb != null && host.disk_total_gb != null
                ? `${host.disk_used_gb} / ${host.disk_total_gb} GB`
                : undefined}
            />
          </div>

          {/* Network + Load + Uptime */}
          <NetBar rx={host.net_rx_bytes} tx={host.net_tx_bytes} />
          <div className="grid grid-cols-2 gap-2">
            <LoadBadge load={host.load_1m} />
            <UptimeChip days={host.uptime_days} />
          </div>
        </div>
      ))}
    </div>
  )
}
