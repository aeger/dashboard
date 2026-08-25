'use client'

import { useEffect, useState } from 'react'
import { useTileMeta } from '@/components/lab/LabTile'
import { useWidgetData } from '@/lib/hooks/useWidgetData'
import type { ClaudeUsage, UsageLimit } from '@/lib/claude-usage'

// Base color per window kind — matches the tier palette in ClaudeSpendWidget
// (Claude Code sky, bucket emerald, NemoClaw violet) so the two tiles read as
// one family. High utilization overrides to amber/red regardless of kind.
const KIND_COLOR: Record<string, string> = {
  session: '#38bdf8',
  weekly_all: '#10b981',
  weekly_scoped: '#a78bfa',
}

function gaugeColor(kind: string, pct: number): string {
  if (pct >= 90) return '#ef4444'
  if (pct >= 75) return '#f59e0b'
  return KIND_COLOR[kind] || '#38bdf8'
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

/** "resets in 3h 12m" — from an ISO timestamp, against a ticking `now`. */
function fmtCountdown(iso: string | null, now: number): string {
  if (!iso) return '—'
  const ms = new Date(iso).getTime() - now
  if (ms <= 60_000) return 'resets soon'
  const mins = Math.floor(ms / 60_000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `resets in ${d}d ${h}h`
  if (h > 0) return `resets in ${h}h ${m}m`
  return `resets in ${m}m`
}

function fmtResetAbs(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return today ? time : `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`
}

/** Shortened meta-line name: "Session" → "session", "Week · Fable" → "Fable". */
function metaName(l: UsageLimit): string {
  if (l.kind === 'session') return 'session'
  if (l.kind === 'weekly_all') return 'week'
  return l.label.replace(/^Week · /, '')
}

function Gauge({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 rounded-full bg-zinc-800/80 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${Math.max(pct, pct > 0 ? 1.5 : 0)}%`,
          background: `linear-gradient(90deg, ${color}cc, ${color})`,
          boxShadow: `0 0 10px ${color}66`,
        }}
      />
    </div>
  )
}

function LimitCell({ limit, now }: { limit: UsageLimit; now: number }) {
  const color = gaugeColor(limit.kind, limit.percent)
  return (
    <div className="rounded-lg bg-zinc-800/30 border border-zinc-700/40 px-3 py-2 min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest truncate">
          {limit.label}
          {limit.kind === 'session' && <span className="text-zinc-600 normal-case tracking-normal"> · 5h</span>}
        </span>
        {limit.isActive && (
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: color, boxShadow: `0 0 6px ${color}` }}
            title="Currently the governing limit"
          />
        )}
      </div>
      <div className="flex items-baseline gap-1.5 mb-1.5">
        <span className="text-xl font-semibold tabular-nums leading-none" style={{ color }}>
          {Math.round(limit.percent)}%
        </span>
        <span className="text-[10px] text-zinc-600">used</span>
      </div>
      <Gauge pct={limit.percent} color={color} />
      <div className="mt-1.5 text-[11px] text-zinc-500 tabular-nums" title={fmtResetAbs(limit.resetsAt)}>
        {fmtCountdown(limit.resetsAt, now)}
      </div>
    </div>
  )
}

export default function ClaudeUsageWidget() {
  const { data, loading, error } = useWidgetData<ClaudeUsage>('/api/claude-usage', {
    intervalMs: 60000,
  })
  // Ticking clock so the countdowns move between polls.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  useTileMeta(
    data?.available
      ? data.limits.map((l) => `${metaName(l)} ${Math.round(l.percent)}%`).join(' · ')
      : undefined,
  )

  if (loading) return <div className="text-xs text-zinc-600">Loading…</div>
  if (error || !data) return <div className="text-xs text-red-400/80">Usage metrics unavailable</div>
  if (!data.available) {
    if (data.reason === 'token_expired')
      return (
        <div className="text-xs text-amber-400/90">
          OAuth token expired — any Claude Code turn on svc-podman-01 refreshes it.
        </div>
      )
    if (data.reason === 'no_credentials')
      return <div className="text-xs text-zinc-600">No Claude Code credentials found.</div>
    return <div className="text-xs text-red-400/80">Usage endpoint unreachable</div>
  }

  const extra = data.extra
  const extraColor = extra && extra.percent >= 90 ? '#ef4444' : '#f59e0b'

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {data.limits.map((l) => (
        <LimitCell key={`${l.kind}-${l.label}`} limit={l} now={now} />
      ))}

      {/* Extra-usage credits — the metered pool past the plan windows */}
      {extra && (
        <div className="rounded-lg bg-zinc-800/30 border border-zinc-700/40 px-3 py-2 min-w-0">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
              Extra usage
            </span>
            <span className="text-[10px] text-zinc-600 tabular-nums">/mo</span>
          </div>
          <div className="flex items-baseline gap-1.5 mb-1.5">
            <span className="text-xl font-semibold tabular-nums leading-none" style={{ color: extraColor }}>
              {fmtUsd(extra.usedUsd)}
            </span>
            <span className="text-[10px] text-zinc-600 tabular-nums">of {fmtUsd(extra.limitUsd)}</span>
          </div>
          <Gauge pct={extra.percent} color={extraColor} />
          <div className="mt-1.5 text-[11px] tabular-nums">
            {extra.spendLimitReached ? (
              <span className="text-red-400/90 font-medium">spend limit reached</span>
            ) : (
              <span className="text-zinc-500">
                <span className="text-emerald-400/90 font-medium">{fmtUsd(extra.limitUsd - extra.usedUsd)}</span> headroom
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** In-place expand — exact reset times and window detail. */
export function ClaudeUsageDetail() {
  const { data } = useWidgetData<ClaudeUsage>('/api/claude-usage', { intervalMs: 60000 })

  if (!data?.available) return <div className="text-xs text-zinc-600">No usage data.</div>

  return (
    <div>
      <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1.5">
        Reset schedule
      </div>
      <div className="flex flex-col">
        {data.limits.map((l) => (
          <div
            key={`${l.kind}-${l.label}`}
            className="flex items-center gap-2 text-xs py-1 border-b border-zinc-800/30 last:border-0 tabular-nums"
          >
            <span
              className="w-[9px] h-[9px] rounded-[3px] flex-shrink-0"
              style={{ background: gaugeColor(l.kind, l.percent) }}
            />
            <span className="font-medium text-zinc-300 flex-1 truncate">{l.label}</span>
            {l.severity !== 'normal' && (
              <span className="text-[10px] text-amber-400/90 uppercase flex-shrink-0">{l.severity}</span>
            )}
            <span className="text-zinc-500 w-12 text-right flex-shrink-0">{Math.round(l.percent)}%</span>
            <span className="text-zinc-400 w-28 text-right flex-shrink-0">
              {l.resetsAt
                ? new Date(l.resetsAt).toLocaleString([], {
                    weekday: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : '—'}
            </span>
          </div>
        ))}
      </div>
      {data.fetchedAt && (
        <div className="mt-2 text-[10px] text-zinc-600 tabular-nums">
          fetched {new Date(data.fetchedAt).toLocaleTimeString()} · polls every 60s
        </div>
      )}
    </div>
  )
}
