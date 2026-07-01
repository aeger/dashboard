'use client'

import { useEffect, useState } from 'react'

interface TierBreakdown {
  tier: number
  name: string
  calls: number
  inputTokens: number
  outputTokens: number
  cost: number
}
interface ModelBreakdown {
  model: string
  calls: number
  inputTokens: number
  outputTokens: number
  cost: number
}
interface Spend {
  available: boolean
  monthLabel: string
  bucketLimit: number
  bucketSpend: number
  apiSpend: number
  freeCalls: number
  bucketPct: number
  mtdCalls: number
  totalCalls: number
  tiers: TierBreakdown[]
  models: ModelBreakdown[]
  daily: { date: string; cost: number }[]
  lastTs: string | null
}

// Tier identity — matches the 3-tier fallback chain in ~/claude/lib/claude_call.py
const TIER_META: Record<number, { label: string; note: string; color: string }> = {
  0: { label: 'Max bucket', note: 'oauth · subscription', color: '#10b981' },
  1: { label: 'API credits', note: 'pay-as-you-go', color: '#f59e0b' },
  2: { label: 'NemoClaw', note: 'local · free', color: '#a78bfa' },
}

function fmtUsd(n: number): string {
  if (n === 0) return '$0.00'
  if (n < 0.01) return '<$0.01'
  return `$${n.toFixed(2)}`
}
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${n}`
}
function fmtModel(m: string): string {
  return m
    .replace(/^claude-/, '')
    .replace(/^nvidia\/nemotron.*/, 'nemotron')
    .replace(/-\d{8}$/, '')
}
function relTime(iso: string | null): string {
  if (!iso) return ''
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 90) return 'just now'
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`
  return `${Math.round(secs / 86400)}d ago`
}

function Sparkline({ data }: { data: { date: string; cost: number }[] }) {
  if (!data.length) return null
  const max = Math.max(...data.map((d) => d.cost), 0.0001)
  const W = 100
  const H = 28
  const bw = W / data.length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-8">
      {data.map((d, i) => {
        const h = Math.max(d.cost > 0 ? 1.5 : 0, (d.cost / max) * (H - 2))
        const isToday = i === data.length - 1
        return (
          <rect
            key={d.date}
            x={i * bw + 0.6}
            y={H - h}
            width={bw - 1.2}
            height={h}
            rx={0.6}
            fill={isToday ? '#34d399' : 'rgba(16,185,129,0.45)'}
          >
            <title>{`${d.date}: ${fmtUsd(d.cost)}`}</title>
          </rect>
        )
      })}
    </svg>
  )
}

export default function ClaudeSpendWidget() {
  const [data, setData] = useState<Spend | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/claude-spend', { cache: 'no-store' })
        const d = await res.json()
        if (alive) {
          setData(d)
          setErr(!d || d.error === true)
        }
      } catch {
        if (alive) setErr(true)
      }
    }
    load()
    const t = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  if (err) return <div className="text-xs text-red-400/80">Spend metrics unavailable</div>
  if (!data) return <div className="text-xs text-zinc-600">Loading…</div>
  if (!data.available)
    return <div className="text-xs text-zinc-600">No programmatic calls logged yet this session.</div>

  const exhausted = data.bucketSpend >= data.bucketLimit
  const gaugeColor = exhausted ? '#f59e0b' : data.bucketPct >= 85 ? '#eab308' : '#10b981'
  const headroom = Math.max(0, data.bucketLimit - data.bucketSpend)

  return (
    <div className="flex flex-col gap-4">
      {/* ── Bucket gauge hero ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-2xl font-semibold tabular-nums text-zinc-100 leading-none">
              {fmtUsd(data.bucketSpend)}
            </span>
            <span className="text-xs text-zinc-500 tabular-nums">
              / ${data.bucketLimit} bucket
            </span>
          </div>
          <span
            className="text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full"
            style={{ color: gaugeColor, background: `${gaugeColor}18` }}
          >
            {data.bucketPct < 0.1 ? '<0.1' : data.bucketPct.toFixed(1)}%
          </span>
        </div>

        <div className="h-2.5 rounded-full bg-zinc-800/80 overflow-hidden relative">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.max(data.bucketPct, data.bucketSpend > 0 ? 1.5 : 0)}%`,
              background: `linear-gradient(90deg, ${gaugeColor}cc, ${gaugeColor})`,
              boxShadow: `0 0 10px ${gaugeColor}66`,
            }}
          />
        </div>

        <div className="flex items-center justify-between mt-1.5 text-[11px]">
          <span className="text-zinc-500">
            {exhausted ? (
              <span className="text-amber-400 font-medium">
                Bucket exhausted — overflow on API credits
              </span>
            ) : (
              <>
                <span className="text-emerald-400/90 font-medium tabular-nums">
                  {fmtUsd(headroom)}
                </span>{' '}
                headroom · {data.monthLabel}
              </>
            )}
          </span>
          <span className="text-zinc-600 tabular-nums">
            {data.mtdCalls} calls MTD
            {data.lastTs && <span className="text-zinc-700"> · {relTime(data.lastTs)}</span>}
          </span>
        </div>
      </div>

      {/* ── Tier distribution ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">
          Fallback tiers · this month
        </div>
        {[0, 1, 2].map((tier) => {
          const meta = TIER_META[tier]
          const t = data.tiers.find((x) => x.tier === tier)
          const calls = t?.calls ?? 0
          const active = calls > 0
          return (
            <div
              key={tier}
              className="flex items-center gap-2.5 text-xs"
              style={{ opacity: active ? 1 : 0.4 }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: meta.color, boxShadow: active ? `0 0 6px ${meta.color}` : 'none' }}
              />
              <span className="font-medium text-zinc-300 w-24 flex-shrink-0">{meta.label}</span>
              <span className="text-[10px] text-zinc-600 flex-shrink-0 w-28 hidden sm:block">
                {meta.note}
              </span>
              <span className="text-zinc-500 tabular-nums flex-1 text-right">{calls} calls</span>
              <span
                className="tabular-nums font-semibold w-16 text-right"
                style={{ color: tier === 2 ? '#71717a' : meta.color }}
              >
                {tier === 2 ? 'free' : fmtUsd(t?.cost ?? 0)}
              </span>
            </div>
          )
        })}
      </div>

      {/* ── 14-day trend ──────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">
            14-day spend
          </div>
          <span className="text-[10px] text-zinc-600 tabular-nums">
            {fmtUsd(data.daily.reduce((s, d) => s + d.cost, 0))} total
          </span>
        </div>
        <Sparkline data={data.daily} />
      </div>

      {/* ── Model breakdown ───────────────────────────────────────────── */}
      {data.models.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1.5">
            By model · this month
          </div>
          <div className="flex flex-col gap-1">
            {data.models.slice(0, 5).map((m) => (
              <div key={m.model} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-[11px] text-zinc-300 truncate flex-1">
                  {fmtModel(m.model)}
                </span>
                <span className="text-[10px] text-zinc-600 tabular-nums flex-shrink-0">
                  {fmtTokens(m.inputTokens)}→{fmtTokens(m.outputTokens)}
                </span>
                <span className="text-zinc-500 tabular-nums w-10 text-right flex-shrink-0">
                  {m.calls}×
                </span>
                <span className="text-zinc-300 tabular-nums font-semibold w-16 text-right flex-shrink-0">
                  {fmtUsd(m.cost)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
