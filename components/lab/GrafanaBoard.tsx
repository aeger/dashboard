'use client'

import { useRef, useState } from 'react'
import { useWidgetData } from '@/lib/hooks/useWidgetData'
import type { ApiPanel, ApiSeries, ApiStat } from '@/app/api/grafana/[board]/route'
import type { Tone, Unit } from '@/lib/grafana-boards'

/**
 * Generic renderer for the Grafana-parity boards defined in lib/grafana-boards.ts.
 * Mirrors each provisioned Grafana dashboard: stat row on top, then chart /
 * bar-gauge / table panels — styled to the lab page, not to Grafana.
 */

// Categorical palette — first three are the dataviz-validated marks vs #18181b.
const PALETTE = [
  '#8b5cf6', '#059669', '#d97706', '#0ea5e9', '#dc2626', '#eab308',
  '#ec4899', '#14b8a6', '#a3e635', '#f97316', '#6366f1', '#22d3ee',
  '#a78bfa', '#71717a',
]

// ── Unit formatting ─────────────────────────────────────────────────────────

function fmtBytes(v: number, perSec = false): string {
  const suffix = perSec ? '/s' : ''
  const abs = Math.abs(v)
  if (abs >= 1024 ** 3) return `${(v / 1024 ** 3).toFixed(abs >= 10 * 1024 ** 3 ? 0 : 1)} GiB${suffix}`
  if (abs >= 1024 ** 2) return `${(v / 1024 ** 2).toFixed(0)} MiB${suffix}`
  if (abs >= 1024) return `${(v / 1024).toFixed(0)} KiB${suffix}`
  return `${v.toFixed(0)} B${suffix}`
}

function fmtBits(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)} Gbps`
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)} Mbps`
  if (abs >= 1e3) return `${(v / 1e3).toFixed(0)} Kbps`
  return `${v.toFixed(0)} bps`
}

export function fmtValue(v: number | null, unit: Unit, decimals?: number): string {
  if (v == null || !Number.isFinite(v)) return '—'
  switch (unit) {
    case 'reqps':
      return `${v < 1 ? v.toFixed(2) : v.toFixed(1)} req/s`
    case 'percent':
      return `${v.toFixed(decimals ?? 1)}%`
    case 'seconds':
      if (v === 0) return '0ms'
      if (v < 0.001) return `${(v * 1e6).toFixed(0)}µs`
      if (v < 1) return `${(v * 1000).toFixed(0)}ms`
      return `${v.toFixed(2)}s`
    case 'bytes':
      return fmtBytes(v)
    case 'Bps':
      return fmtBytes(v, true)
    case 'bps':
      return fmtBits(v)
    case 'pps':
      return `${v < 1 ? v.toFixed(2) : v.toFixed(0)} pps`
    case 'days':
      return `${Math.round(v)}d`
    case 'bool':
      return v === 1 ? 'UP' : 'DOWN'
    case 'cores':
      return `${v.toFixed(decimals ?? 2)} cores`
    case 'duration': {
      if (v >= 86400) return `${(v / 86400).toFixed(1)}d`
      if (v >= 3600) return `${Math.floor(v / 3600)}h ${Math.floor((v % 3600) / 60)}m`
      return `${Math.floor(v / 60)}m`
    }
    default: {
      const abs = Math.abs(v)
      if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`
      if (abs >= 1e4) return `${(v / 1e3).toFixed(1)}k`
      return v.toFixed(decimals ?? (Number.isInteger(v) ? 0 : 2))
    }
  }
}

// ── Tone → color ────────────────────────────────────────────────────────────

const TONE_COLOR = { ok: '#34d399', warn: '#fbbf24', crit: '#f87171', none: '#f4f4f5' } as const
type ToneKey = keyof typeof TONE_COLOR

function toneOf(v: number | null, tone?: Tone): ToneKey {
  if (v == null || !tone) return 'none'
  if (tone.dir === 'down') {
    if (tone.crit != null && v <= tone.crit) return 'crit'
    if (tone.warn != null && v <= tone.warn) return 'warn'
    return 'ok'
  }
  if (tone.crit != null && v >= tone.crit) return 'crit'
  if (tone.warn != null && v >= tone.warn) return 'warn'
  return 'ok'
}

// ── Stat cell ───────────────────────────────────────────────────────────────

function StatCell({ stat }: { stat: ApiStat }) {
  const tone = toneOf(stat.value, stat.tone)
  return (
    <div className="flex flex-col justify-between rounded-lg p-3 min-w-0 bg-zinc-800/40 border border-zinc-700/30 min-h-[64px]">
      <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider truncate">{stat.title}</div>
      <div className="text-lg font-bold leading-none tabular-nums mt-1.5" style={{ color: TONE_COLOR[tone] }}>
        {fmtValue(stat.value, stat.unit, stat.decimals)}
      </div>
    </div>
  )
}

// ── Time-series chart ───────────────────────────────────────────────────────

const CW = 560
const CH = 150
const PAD = { l: 6, r: 6, t: 6, b: 18 }

function fmtTick(v: number, unit: Unit): string {
  // Shorter than fmtValue — axis labels need to stay compact.
  if (unit === 'percent') return `${Math.round(v)}%`
  if (unit === 'bytes') return fmtBytes(v)
  if (unit === 'Bps') return fmtBytes(v, true)
  if (unit === 'bps') return fmtBits(v)
  if (unit === 'seconds') return v < 1 ? `${(v * 1000).toFixed(0)}ms` : `${v.toFixed(1)}s`
  if (unit === 'bool') return v === 1 ? 'up' : v === 0 ? 'down' : ''
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`
  return v < 10 && v !== Math.round(v) ? v.toFixed(1) : String(Math.round(v))
}

function TimeSeriesChart({ series, unit, stack }: { series: ApiSeries[]; unit: Unit; stack?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ idx: number; fx: number; px: number } | null>(null)

  if (!series.length)
    return <div className="text-xs text-zinc-600 text-center py-8">no data in range</div>

  // Common time domain from the longest series.
  const ref = series.reduce((a, b) => (b.points.length > a.points.length ? b : a))
  const minT = ref.points[0][0]
  const maxT = ref.points[ref.points.length - 1][0]
  const tRange = maxT - minT || 1

  // Stack: cumulative sums per timestamp index (series share the query step).
  const stacked = stack
    ? series.map((_, i) =>
        ref.points.map((_, pi) =>
          series.slice(0, i + 1).reduce((sum, s) => sum + (s.points[pi]?.[1] ?? 0), 0),
        ),
      )
    : null

  let maxV: number
  if (unit === 'bool') maxV = 1
  else if (stacked) maxV = Math.max(...stacked[stacked.length - 1], 0.001) * 1.08
  else maxV = Math.max(...series.flatMap((s) => s.points.map((p) => p[1])).filter(Number.isFinite), 0.001) * 1.08

  const iw = CW - PAD.l - PAD.r
  const ih = CH - PAD.t - PAD.b
  const xs = (t: number) => PAD.l + ((t - minT) / tRange) * iw
  const ys = (v: number) => PAD.t + ih - (Math.min(v, maxV) / maxV) * ih

  const colorOf = (s: ApiSeries, i: number) => s.color ?? PALETTE[i % PALETTE.length]

  const xTicks = [0.02, 0.35, 0.68, 0.98].map((f) => minT + f * tRange)
  const yTicks = unit === 'bool' ? [1] : [maxV * 0.33, maxV * 0.66, maxV].map((v) => v / 1.08)

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = (e.target as SVGSVGElement).closest('svg')!.getBoundingClientRect()
    const fx = (e.clientX - rect.left) / rect.width
    const idx = Math.max(0, Math.min(ref.points.length - 1, Math.round(fx * (ref.points.length - 1))))
    setHover({ idx, fx, px: e.clientX - (wrapRef.current?.getBoundingClientRect().left ?? 0) })
  }

  const hoverT = hover ? ref.points[hover.idx][0] : null

  return (
    <div ref={wrapRef} className="relative">
      <svg
        viewBox={`0 0 ${CW} ${CH}`}
        preserveAspectRatio="none"
        className="w-full cursor-crosshair"
        style={{ height: '140px' }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {yTicks.map((v, i) => (
          <line key={i} x1={PAD.l} x2={CW - PAD.r} y1={ys(v)} y2={ys(v)} stroke="rgba(63,63,70,0.3)" strokeWidth="1" />
        ))}
        {stacked
          ? series.map((s, i) => {
              const top = stacked[i]
              const bottom = i === 0 ? null : stacked[i - 1]
              const forward = ref.points.map((p, pi) => `${xs(p[0]).toFixed(1)},${ys(top[pi]).toFixed(1)}`).join(' L')
              const backward = bottom
                ? [...ref.points].reverse().map((p, ri) => `${xs(p[0]).toFixed(1)},${ys(bottom[ref.points.length - 1 - ri]).toFixed(1)}`).join(' L')
                : `${xs(maxT).toFixed(1)},${ys(0)} L${xs(minT).toFixed(1)},${ys(0)}`
              return <path key={s.name + i} d={`M${forward} L${backward} Z`} fill={colorOf(s, i)} opacity={0.55} />
            })
          : series.map((s, i) => {
              const pts = s.points
                .filter((p) => Number.isFinite(p[1]))
                .map((p) => `${xs(p[0]).toFixed(1)},${ys(p[1]).toFixed(1)}`)
                .join(' ')
              return (
                <polyline
                  key={s.name + i}
                  points={pts}
                  fill="none"
                  stroke={colorOf(s, i)}
                  strokeWidth="1.6"
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
        {hoverT != null && (
          <line x1={xs(hoverT)} x2={xs(hoverT)} y1={PAD.t} y2={PAD.t + ih} stroke="rgba(244,244,245,0.3)" strokeWidth="1" />
        )}
        {xTicks.map((t, i) => (
          <text key={i} x={xs(t)} y={CH - 5} textAnchor="middle" fontSize="9" fill="#71717a">
            {new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
          </text>
        ))}
        {yTicks.map((v, i) => (
          <text key={i} x={PAD.l + 2} y={ys(v) - 3} fontSize="9" fill="#71717a">
            {fmtTick(v, unit)}
          </text>
        ))}
      </svg>

      {/* Hover tooltip — all series at the hovered step, capped for readability */}
      {hover && (
        <div
          className="absolute z-20 pointer-events-none bg-zinc-800/95 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-[10px] leading-relaxed shadow-xl whitespace-nowrap"
          style={{
            top: '-4px',
            left: hover.fx < 0.55 ? `${hover.px + 14}px` : undefined,
            right: hover.fx >= 0.55 ? `${(wrapRef.current?.clientWidth ?? 0) - hover.px + 14}px` : undefined,
          }}
        >
          <div className="text-zinc-500 tabular-nums mb-0.5">
            {new Date(ref.points[hover.idx][0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
          </div>
          {series.slice(0, 8).map((s, i) => (
            <div key={s.name + i} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: colorOf(s, i) }} />
              <span className="text-zinc-400 truncate max-w-[160px]">{s.name}</span>
              <span className="text-zinc-200 tabular-nums ml-auto pl-2">
                {fmtValue(s.points[hover.idx]?.[1] ?? null, unit)}
              </span>
            </div>
          ))}
          {series.length > 8 && <div className="text-zinc-600">…{series.length - 8} more</div>}
        </div>
      )}

      {/* Legend — name + last value */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
        {series.map((s, i) => (
          <span key={s.name + i} className="inline-flex items-center gap-1.5 text-[10px] text-zinc-500 min-w-0">
            <span className="w-2 h-[3px] rounded-full flex-shrink-0" style={{ background: colorOf(s, i) }} />
            <span className="truncate max-w-[150px]">{s.name}</span>
            <span className="text-zinc-600 tabular-nums">
              {fmtValue(s.points[s.points.length - 1]?.[1] ?? null, unit)}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Bar gauge ───────────────────────────────────────────────────────────────

function BarGauge({ rows, unit, tone }: { rows: { name: string; value: number }[]; unit: Unit; tone?: Tone }) {
  if (!rows.length) return <div className="text-xs text-zinc-600 text-center py-8">no data</div>
  const max = Math.max(...rows.map((r) => r.value), 0.001)
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => {
        const t = toneOf(r.value, tone)
        const barColor = t === 'crit' ? '#dc2626' : t === 'warn' ? '#d97706' : '#8b5cf6'
        return (
          <div key={r.name} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="text-zinc-400 truncate">{r.name}</span>
              <span className="tabular-nums flex-shrink-0" style={{ color: TONE_COLOR[t] === '#f4f4f5' ? '#a1a1aa' : TONE_COLOR[t] }}>
                {fmtValue(r.value, unit)}
              </span>
            </div>
            <div className="h-[5px] rounded-full bg-zinc-800/80 overflow-hidden mt-0.5">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(1, (r.value / max) * 100)}%`, background: `${barColor}cc` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Table ───────────────────────────────────────────────────────────────────

function BoardTable({
  columns,
  rows,
}: {
  columns: { title: string; unit: Unit; tone?: Tone }[]
  rows: { name: string; values: (number | null)[] }[]
}) {
  if (!rows.length) return <div className="text-xs text-zinc-600 text-center py-8">no data</div>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left text-[9px] uppercase tracking-wider text-zinc-600 border-b border-zinc-800/60">
            <th className="py-1 pr-2 font-semibold">Name</th>
            {columns.map((c) => (
              <th key={c.title} className="py-1 px-2 font-semibold text-right">{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-zinc-800/30 last:border-0">
              <td className="py-1 pr-2 text-zinc-300 max-w-[220px] truncate" title={r.name}>{r.name}</td>
              {r.values.map((v, ci) => {
                const c = columns[ci]
                if (c.unit === 'bool') {
                  const up = v === 1
                  return (
                    <td key={ci} className="py-1 px-2 text-right">
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${
                          up
                            ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50'
                            : v == null
                              ? 'bg-zinc-800 text-zinc-500 border-zinc-700/50'
                              : 'bg-red-900/50 text-red-300 border-red-700/50'
                        }`}
                      >
                        {v == null ? '—' : up ? 'UP' : 'DOWN'}
                      </span>
                    </td>
                  )
                }
                const t = toneOf(v, c.tone)
                return (
                  <td
                    key={ci}
                    className="py-1 px-2 text-right tabular-nums"
                    style={{ color: t === 'none' ? '#a1a1aa' : TONE_COLOR[t] }}
                  >
                    {fmtValue(v, c.unit)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Board ───────────────────────────────────────────────────────────────────

interface BoardData {
  title: string
  stats: ApiStat[]
  panels: ApiPanel[]
}

export default function GrafanaBoard({ board }: { board: string }) {
  const { data, loading, error } = useWidgetData<BoardData>(`/api/grafana/${board}`, { intervalMs: 60000 })

  if (error && data == null)
    return <div className="text-xs text-red-400/80 text-center py-8">Metrics unavailable</div>
  if (loading || data == null)
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
      </div>
    )

  return (
    <div className="flex flex-col gap-3">
      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
        {data.stats.map((s) => (
          <StatCell key={s.title} stat={s} />
        ))}
      </div>

      {/* Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {data.panels.map((p) => (
          <div
            key={p.title}
            className={`rounded-lg bg-zinc-800/25 border border-zinc-800/60 p-3 min-w-0 ${
              p.kind === 'table' || (p.kind === 'timeseries' && p.wide) ? 'md:col-span-2' : ''
            }`}
          >
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">{p.title}</div>
            {p.kind === 'timeseries' && <TimeSeriesChart series={p.series} unit={p.unit} stack={p.stack} />}
            {p.kind === 'bargauge' && <BarGauge rows={p.rows} unit={p.unit} tone={p.tone} />}
            {p.kind === 'table' && <BoardTable columns={p.columns} rows={p.rows} />}
          </div>
        ))}
      </div>
    </div>
  )
}
