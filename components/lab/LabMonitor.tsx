'use client'

import { useState } from 'react'
import { useWidgetData } from '@/lib/hooks/useWidgetData'
import { StatusChip, StatusDot, type StatusTone } from '@/components/lab/Status'
import { useTileMeta } from '@/components/lab/LabTile'
import GrafanaBoard from '@/components/lab/GrafanaBoard'
import type { AdGuardStats } from '@/lib/adguard'
import type { NetworkStats } from '@/app/api/network/route'
import type { Monitor } from '@/lib/uptime-kuma'

// ── Types ──────────────────────────────────────────────────────────────────

type Tab = 'services' | 'network' | 'dns'

// ── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(b: number): string {
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(2)} GB/s`
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB/s`
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB/s`
  return `${Math.round(b)} B/s`
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

// ── Mini horizontal bar ────────────────────────────────────────────────────

function HBar({ value, max, color = '#6366f1' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-1.5 rounded-full bg-zinc-700 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

// ── Uptime arc (SVG) ───────────────────────────────────────────────────────
function UptimeArc({ pct }: { pct: number }) {
  const r = 10
  const circ = 2 * Math.PI * r
  const filled = (pct / 100) * circ
  const color = pct >= 99 ? '#22c55e' : pct >= 90 ? '#f59e0b' : '#ef4444'
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" className="flex-shrink-0">
      <circle cx="14" cy="14" r={r} fill="none" stroke="#3f3f46" strokeWidth="3" />
      <circle
        cx="14" cy="14" r={r} fill="none"
        stroke={color} strokeWidth="3"
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 14 14)"
      />
    </svg>
  )
}

// ── Response-time bars ─────────────────────────────────────────────────────
// Horizontal bar list, ALL monitors with a ping, sorted slowest-first — the
// old vertical chart showed an arbitrary first-8 subset with unreadable 8px
// colliding labels. Horizontal rows give names full width and the sort order
// itself answers "who is slow?".
function ResponseTimeBars({ monitors }: { monitors: Monitor[] }) {
  const withPing = monitors
    .filter((m) => m.ping != null && m.ping > 0)
    .sort((a, b) => b.ping! - a.ping!)
  if (!withPing.length) return null
  const maxPing = Math.max(...withPing.map((m) => m.ping!), 1)

  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">Response times</div>
        <span className="text-[10px] text-zinc-600">{withPing.length} monitors · slowest first</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-1">
        {withPing.map((m) => {
          // Same thresholds as the row ping colors: <150 ok, 150–300 warn, >300 crit
          const bar = m.ping! > 300 ? '#dc2626' : m.ping! > 150 ? '#d97706' : '#059669'
          const text = m.ping! > 300 ? 'text-red-300' : m.ping! > 150 ? 'text-amber-300' : 'text-zinc-500'
          return (
            <div key={m.id} className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] text-zinc-400 truncate w-36 flex-shrink-0" title={m.name}>{m.name}</span>
              <div className="flex-1 h-[5px] rounded-full bg-zinc-800/80 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(2, (m.ping! / maxPing) * 100)}%`, background: `${bar}cc` }}
                />
              </div>
              <span className={`text-[11px] tabular-nums w-14 text-right flex-shrink-0 ${text}`}>{m.ping}ms</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── DNS blocked donut ──────────────────────────────────────────────────────
function BlockedDonut({ total, blocked }: { total: number; blocked: number }) {
  const pct = total > 0 ? blocked / total : 0
  const r = 22
  const circ = 2 * Math.PI * r
  const filled = pct * circ
  return (
    <div className="flex items-center gap-3">
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#3f3f46" strokeWidth="5" />
        <circle
          cx="28" cy="28" r={r} fill="none"
          stroke="#ef4444" strokeWidth="5" opacity={0.75}
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
        />
        <text x="28" y="32" textAnchor="middle" fontSize="11" fontWeight="600" fill="white">
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <div className="space-y-0.5">
        <div className="text-xs text-zinc-400">Queries <span className="text-white font-medium">{formatNum(total)}</span></div>
        <div className="text-xs text-red-400">Blocked <span className="text-white font-medium">{formatNum(blocked)}</span></div>
      </div>
    </div>
  )
}

// ── Tab button (segmented control) ─────────────────────────────────────────
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] font-semibold px-3 py-1.5 rounded-md transition-colors ${
        active ? 'bg-zinc-700/70 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {children}
    </button>
  )
}

// ── Spinner ────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center justify-center h-24">
      <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
    </div>
  )
}

// ── Services Tab ───────────────────────────────────────────────────────────
function ServicesTab() {
  // Shared hook: 30s poll + error state (tabs previously fetched once and went
  // stale on a long-open page; a failed fetch spun forever).
  const { data: monitors, error } = useWidgetData<Monitor[]>('/api/services', {
    select: (raw) => (raw as { monitors?: Monitor[] }).monitors ?? [],
  })
  useTileMeta(monitors?.length ? `uptime-kuma · ${monitors.length} monitors` : undefined)

  if (error && monitors == null)
    return <div className="text-xs text-red-400/80 text-center py-6">Service monitors unavailable</div>
  if (!monitors) return <Spinner />
  if (!monitors.length) return <div className="text-zinc-500 text-sm text-center py-6">No monitors configured</div>

  const statusGroups: Record<string, { color: string; label: string }> = {
    up:          { color: 'bg-green-400',  label: 'up' },
    down:        { color: 'bg-red-400',    label: 'down' },
    pending:     { color: 'bg-amber-400',  label: 'pending' },
    maintenance: { color: 'bg-blue-400',   label: 'maintenance' },
  }
  const counts: Record<string, number> = {}
  for (const m of monitors) {
    counts[m.status] = (counts[m.status] ?? 0) + 1
  }

  // Collapsed view (mockup): problems first, then slowest — a short list that
  // answers "anything wrong?"; the full grid lives in the tile expand.
  const COLLAPSED_COUNT = 6
  const shown = [...monitors]
    .sort((a, b) => Number(a.status === 'up') - Number(b.status === 'up') || (b.ping ?? 0) - (a.ping ?? 0))
    .slice(0, COLLAPSED_COUNT)

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-3 flex-wrap text-xs">
        {Object.entries(statusGroups).map(([status, { color, label }]) =>
          counts[status] ? (
            <div key={status} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
              <span className="text-zinc-200 font-medium">{counts[status]}</span>
              <span className="text-zinc-500">{label}</span>
            </div>
          ) : null
        )}
        {Object.keys(counts).filter((s) => !statusGroups[s]).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0 bg-zinc-500" />
            <span className="text-zinc-200 font-medium">{counts[s]}</span>
            <span className="text-zinc-500">{s}</span>
          </div>
        ))}
        <span className="text-zinc-600 ml-auto">{monitors.length} total</span>
      </div>

      {/* Compact single-column rows: dot + name · ping + uptime chip */}
      <div className="flex flex-col">
        {shown.map((m) => {
          const statusTone: StatusTone = m.status === 'up' ? 'ok' : m.status === 'down' ? 'crit' : 'warn'
          const uptimeTone: StatusTone = m.uptime >= 99 ? 'ok' : m.uptime >= 90 ? 'warn' : 'crit'
          const pingColor = m.ping == null ? '' : m.ping > 300 ? 'text-red-400' : m.ping > 150 ? 'text-amber-400' : 'text-zinc-500'
          return (
            <div key={m.id} className="flex items-center gap-2.5 py-1.5 border-b border-zinc-800/30 last:border-0 min-w-0">
              <StatusDot tone={statusTone} pulse={m.status === 'down'} />
              <span className="text-xs text-zinc-200 truncate flex-1">{m.name}</span>
              {m.ping != null && (
                <span className={`text-[11px] tabular-nums flex-shrink-0 ${pingColor}`}>{m.ping}ms</span>
              )}
              <StatusChip tone={uptimeTone}>{m.uptime}%</StatusChip>
            </div>
          )
        })}
      </div>
      {monitors.length > COLLAPSED_COUNT && (
        <div className="text-[10px] text-zinc-600">
          …{monitors.length - COLLAPSED_COUNT} more — expand for all monitors &amp; response times
        </div>
      )}
    </div>
  )
}

// ── Network Tab ────────────────────────────────────────────────────────────
function NetworkTab() {
  const { data: stats, error } = useWidgetData<NetworkStats>('/api/network')

  if (error && stats == null)
    return <div className="text-xs text-red-400/80 text-center py-6">Network stats unavailable</div>
  if (!stats) return <Spinner />

  const maxBw = Math.max(...(stats.interfaces.flatMap((i) => [i.rx_bytes_per_sec, i.tx_bytes_per_sec])), 1)

  return (
    <div className="space-y-4">
      {/* WAN checks */}
      <div>
        <div className="text-xs text-zinc-600 uppercase tracking-wider mb-2">WAN Connectivity</div>
        <div className="grid grid-cols-3 gap-2">
          {stats.wan_checks.map((c) => (
            <div key={c.name} className="bg-zinc-800/50 rounded-lg p-2 text-center">
              <div className={`text-xs font-medium ${c.ok ? 'text-green-400' : 'text-red-400'}`}>
                {c.ok ? '●' : '✕'} {c.name}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">
                {c.latency_ms != null ? `${c.latency_ms}ms` : 'timeout'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Interface bandwidth */}
      {stats.interfaces.length > 0 && (
        <div>
          <div className="text-xs text-zinc-600 uppercase tracking-wider mb-2">Interface Bandwidth</div>
          <div className="space-y-2.5">
            {stats.interfaces.map((iface) => (
              <div key={iface.device} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400 font-mono">{iface.device}</span>
                  <span className="text-zinc-500">
                    ↓ {formatBytes(iface.rx_bytes_per_sec)} · ↑ {formatBytes(iface.tx_bytes_per_sec)}
                  </span>
                </div>
                <HBar value={iface.rx_bytes_per_sec} max={maxBw} color="#6366f1" />
                <HBar value={iface.tx_bytes_per_sec} max={maxBw} color="#f59e0b" />
              </div>
            ))}
            <div className="flex gap-4 text-[10px] text-zinc-600 pt-0.5">
              <span><span className="text-indigo-400">■</span> Download</span>
              <span><span className="text-amber-400">■</span> Upload</span>
            </div>
          </div>
        </div>
      )}

      {!stats.interfaces.length && (
        <div className="text-zinc-500 text-sm text-center py-4">Prometheus not available — WAN checks only</div>
      )}
    </div>
  )
}

// ── DNS Tab ────────────────────────────────────────────────────────────────
function DnsTab() {
  const [subTab, setSubTab] = useState<'queried' | 'blocked' | 'clients'>('queried')
  // select maps an AdGuard error payload to null → "not configured" below.
  const { data: dns, loading, error } = useWidgetData<AdGuardStats | null>('/api/dns', {
    intervalMs: 60000,
    select: (raw) => ((raw as { error?: unknown })?.error ? null : (raw as AdGuardStats)),
  })

  if (loading) return <Spinner />
  if (!dns)
    return (
      <div className="text-zinc-500 text-sm text-center py-6">
        {error ? 'DNS stats unavailable' : 'AdGuard not configured'}
      </div>
    )

  const maxDomain = Math.max(
    ...(subTab === 'queried' ? dns.top_queried_domains : subTab === 'blocked' ? dns.top_blocked_domains : dns.top_clients)
      .map((d) => d.count), 1
  )
  const barColor = subTab === 'blocked' ? '#ef4444' : '#6366f1'
  const items = subTab === 'queried' ? dns.top_queried_domains
    : subTab === 'blocked' ? dns.top_blocked_domains
    : dns.top_clients

  return (
    <div className="space-y-3">
      {/* Header stats */}
      <div className="flex items-start justify-between">
        <BlockedDonut total={dns.total_dns_queries} blocked={dns.blocked_filtering} />
        <div className="text-right space-y-1">
          <div className="text-xs text-zinc-500">{dns.num_filter_lists} lists · {formatNum(dns.num_rules)} rules</div>
          <div className={`text-xs font-medium ${dns.protection_enabled ? 'text-green-400' : 'text-red-400'}`}>
            {dns.protection_enabled ? '● Protection Active' : '✕ Protection Off'}
          </div>
          <div className="text-xs text-zinc-500">Avg {dns.avg_processing_time_ms}ms</div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1">
        {(['queried', 'blocked', 'clients'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`text-xs px-2 py-1 rounded transition-colors ${subTab === t ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:text-zinc-400'}`}
          >
            {t === 'queried' ? 'Top Queried' : t === 'blocked' ? 'Top Blocked' : 'Top Clients'}
          </button>
        ))}
      </div>

      {/* Bar list */}
      <div className="space-y-1.5">
        {items.slice(0, 8).map((d, i) => (
          <div key={i} className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-300 truncate">{d.name}</span>
              <span className="text-zinc-500 ml-2 flex-shrink-0">{formatNum(d.count)}</span>
            </div>
            <HBar value={d.count} max={maxDomain} color={barColor} />
          </div>
        ))}
        {items.length === 0 && <div className="text-xs text-zinc-600 text-center py-2">No data</div>}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function LabMonitor() {
  const [tab, setTab] = useState<Tab>('services')

  return (
    <div className="space-y-0">
      {/* Tab bar — segmented control */}
      <div className="inline-flex gap-0.5 bg-zinc-800/50 border border-zinc-700/40 rounded-lg p-0.5 mb-4">
        <TabBtn active={tab === 'services'} onClick={() => setTab('services')}>Services</TabBtn>
        <TabBtn active={tab === 'network'} onClick={() => setTab('network')}>WAN & Network</TabBtn>
        <TabBtn active={tab === 'dns'} onClick={() => setTab('dns')}>DNS / AdGuard</TabBtn>
      </div>

      {tab === 'services' && <ServicesTab />}
      {tab === 'network'  && <NetworkTab />}
      {tab === 'dns'      && <DnsTab />}
    </div>
  )
}

// ── In-place expand detail ─────────────────────────────────────────────────

/**
 * Tile expand: full monitor grid + response-time chart, plus the MikroTik
 * SNMP board (Grafana "MikroTik Network" parity — RB5009 + CRS309).
 */
export function MonitorDetail() {
  const [tab, setTab] = useState<'monitors' | 'mikrotik'>('monitors')
  const { data: monitors } = useWidgetData<Monitor[]>('/api/services', {
    select: (raw) => (raw as { monitors?: Monitor[] }).monitors ?? [],
  })

  return (
    <div>
      <div className="inline-flex gap-0.5 bg-zinc-800/50 border border-zinc-700/40 rounded-lg p-0.5 mb-4">
        <TabBtn active={tab === 'monitors'} onClick={() => setTab('monitors')}>All monitors</TabBtn>
        <TabBtn active={tab === 'mikrotik'} onClick={() => setTab('mikrotik')}>MikroTik · SNMP</TabBtn>
      </div>

      {tab === 'monitors' && (
        !monitors ? (
          <Spinner />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {monitors.map((m) => {
                const statusTone: StatusTone = m.status === 'up' ? 'ok' : m.status === 'down' ? 'crit' : 'warn'
                const uptimeTone: StatusTone = m.uptime >= 99 ? 'ok' : m.uptime >= 90 ? 'warn' : 'crit'
                const pingColor = m.ping == null ? '' : m.ping > 300 ? 'text-red-400' : m.ping > 150 ? 'text-amber-400' : 'text-zinc-500'
                return (
                  <div key={m.id} className="flex items-center gap-2 bg-zinc-800/40 rounded-lg px-2.5 py-1.5 min-w-0">
                    <UptimeArc pct={m.uptime} />
                    <StatusDot tone={statusTone} pulse={m.status === 'down'} />
                    <span className="text-xs text-zinc-200 truncate flex-1">{m.name}</span>
                    {m.ping != null && (
                      <span className={`text-[11px] tabular-nums flex-shrink-0 ${pingColor}`}>{m.ping}ms</span>
                    )}
                    <StatusChip tone={uptimeTone}>{m.uptime}%</StatusChip>
                  </div>
                )
              })}
            </div>
            <ResponseTimeBars monitors={monitors} />
          </div>
        )
      )}

      {tab === 'mikrotik' && <GrafanaBoard board="mikrotik" />}
    </div>
  )
}
