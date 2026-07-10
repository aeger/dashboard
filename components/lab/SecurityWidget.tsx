'use client'

import { useEffect, useState } from 'react'
import { useWidgetData } from '@/lib/hooks/useWidgetData'
import { StatusChip, StatusDot, type StatusTone } from '@/components/lab/Status'
import { useTileMeta } from '@/components/lab/LabTile'

interface Finding {
  id: string
  category: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
  recommendation?: string
}

interface SecurityData {
  scanned_at: string
  score: number
  findings: Finding[]
  stats: {
    ssh_failures_24h: number
    root_login_attempts_24h: number
    active_sessions: number
    privileged_containers: number
    failed_services: number
    updates_available: number
    disk_percent: number
    container_count: number
    game_server_ip: string
    game_open_ports: number[]
    game_services: Record<number, string>
  }
  counts: { critical: number; warning: number; info: number }
}

const SEV_TONE: Record<Finding['severity'], StatusTone> = {
  critical: 'crit',
  warning: 'warn',
  info: 'info',
}

const CAT_LABELS: Record<string, string> = {
  auth:        'Auth',
  network:     'Network',
  certs:       'Certs',
  containers:  'Containers',
  system:      'System',
  game_server: 'Game Server',
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000)    return 'just now'
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

/**
 * Collapsed view — mockup layout: big mono score left, top open findings as
 * dot+title+severity rows. Everything richer (quick stats, ports, full
 * accordion, rescan) lives in SecurityDetail, revealed by the tile expand.
 */
export default function SecurityWidget() {
  const { data, loading, error } = useWidgetData<SecurityData | null>('/api/security', {
    intervalMs: 5 * 60 * 1000,
    select: (raw) => ((raw as { error?: unknown })?.error ? null : (raw as SecurityData)),
  })
  useTileMeta(data ? `last scan ${timeAgo(data.scanned_at)}` : undefined)

  if (error && data == null)
    return <div className="text-xs text-red-400/80 text-center py-6">Security data unavailable</div>
  if (loading && data == null) return (
    <div className="flex items-center justify-center h-24">
      <div className="w-5 h-5 border-2 border-zinc-600 border-t-amber-400 rounded-full animate-spin" />
    </div>
  )
  if (!data) return <div className="text-xs text-zinc-600 text-center py-6">No scan data yet — expand to run one</div>

  // Score tone drives the gauge arc color (neutral number, colored ring —
  // matches the prototype). Arc length = fraction of the r=42 circumference.
  const scoreTone = data.score >= 80 ? 'ok' : data.score >= 60 ? 'warn' : 'crit'
  const CIRC = 2 * Math.PI * 42
  const arc = (Math.max(0, Math.min(100, data.score)) / 100) * CIRC
  // Most severe first; the collapsed tile shows the top few open findings.
  const order = { critical: 0, warning: 1, info: 2 }
  const sorted = [...data.findings].sort((a, b) => order[a.severity] - order[b.severity])
  const top = sorted.slice(0, 4)
  const topCrit = sorted.find((f) => f.severity === 'critical')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-4">
        {/* Radial score gauge — track ring + score arc, thin mono numeral. */}
        <div className="relative flex-none" style={{ width: 90, height: 90 }}>
          <svg viewBox="0 0 100 100" style={{ width: 90, height: 90, transform: 'rotate(-90deg)' }}>
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--t-track)" strokeWidth="9" />
            <circle
              cx="50" cy="50" r="42" fill="none"
              stroke={`var(--t-${scoreTone})`} strokeWidth="9" strokeLinecap="round"
              strokeDasharray={`${arc.toFixed(1)} ${CIRC.toFixed(1)}`}
              style={{ transition: 'stroke-dasharray .6s cubic-bezier(.4,0,.2,1)' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="az-metric" style={{ fontSize: 27, lineHeight: 1 }}>{data.score}</span>
            <span className="az-label mt-1" style={{ fontSize: 8 }}>score</span>
          </div>
        </div>

        {/* Top open findings */}
        <div className="flex-1 min-w-0">
          {top.length === 0 ? (
            <div className="text-xs text-emerald-400/90 py-2">✓ No open findings — everything looks clean</div>
          ) : (
            <div className="flex flex-col">
              {top.map((f) => (
                <div key={f.id} className="flex items-center gap-2.5 py-1.5 border-b border-zinc-800/30 last:border-0 min-w-0">
                  <StatusDot tone={SEV_TONE[f.severity]} pulse={f.severity === 'critical'} />
                  <span className="text-xs text-zinc-300 truncate flex-1" title={f.detail}>{f.title}</span>
                  <StatusChip tone={SEV_TONE[f.severity]}>{f.severity === 'warning' ? 'medium' : f.severity}</StatusChip>
                </div>
              ))}
              {data.findings.length > top.length && (
                <div className="text-[10px] text-zinc-600 pt-1.5">
                  …{data.findings.length - top.length} more — expand for all findings
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live alert strip — surfaces the top CRITICAL finding (real scan data,
          not the mockup's hardcoded cert line). Once the scanner emits a cert-
          expiry finding it flows straight into here. Hidden when nothing is critical. */}
      {topCrit && (
        <div
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 min-w-0"
          style={{ background: 'var(--t-critsoft)', border: '1px solid var(--t-critsoft)' }}
        >
          <span className="w-2 h-2 rounded-full flex-none animate-pulse" style={{ background: 'var(--t-crit)' }} />
          <span className="text-[8px] font-semibold uppercase tracking-[0.14em] flex-none" style={{ color: 'var(--t-crittx)' }}>Alert</span>
          <span className="text-[11px] truncate" style={{ color: 'var(--t-tx)' }} title={topCrit.detail}>{topCrit.title}</span>
        </div>
      )}
    </div>
  )
}

/**
 * In-place expand detail — quick stats, game ports, category rollup, the full
 * findings accordion with recommendations, and the rescan control.
 */
export function SecurityDetail() {
  const [data, setData] = useState<SecurityData | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  const load = () =>
    fetch('/api/security')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setData(d) })
      .catch(() => {})

  useEffect(() => {
    load()
    const id = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  async function triggerScan() {
    setScanning(true)
    setScanError(null)
    try {
      const r = await fetch('/api/security/scan', { method: 'POST' })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        setScanError(body.error || `Scan failed (HTTP ${r.status})`)
      }
      await load()
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Scan request failed')
    } finally {
      setScanning(false)
    }
  }

  if (!data) return <div className="text-xs text-zinc-600">Loading…</div>

  const SEV = {
    critical: { text: 'text-red-400',   bg: 'bg-red-500/15'   },
    warning:  { text: 'text-amber-400', bg: 'bg-amber-500/15' },
    info:     { text: 'text-blue-400',  bg: 'bg-blue-500/15'  },
  }

  const byCat: Record<string, number> = {}
  for (const f of data.findings) byCat[f.category] = (byCat[f.category] ?? 0) + 1

  return (
    <div className="space-y-4">
      {/* Quick stats + rescan */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="grid grid-cols-3 gap-2 flex-1 min-w-[240px]">
          {[
            { val: data.stats.ssh_failures_24h.toLocaleString(), label: 'SSH fails/24h',
              color: data.stats.ssh_failures_24h > 200 ? 'text-red-400' : data.stats.ssh_failures_24h > 50 ? 'text-amber-400' : 'text-zinc-200' },
            { val: `${data.stats.disk_percent}%`, label: 'Disk used',
              color: data.stats.disk_percent >= 85 ? 'text-amber-400' : 'text-zinc-200' },
            { val: data.stats.game_open_ports.length, label: 'Game ports open', color: 'text-zinc-200' },
          ].map(({ val, label, color }) => (
            <div key={label} className="az-tile text-center">
              <div className={`text-sm font-semibold ${color}`}>{val}</div>
              <div className="text-[10px] text-zinc-600 leading-tight mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        <button
          onClick={triggerScan}
          disabled={scanning}
          className="text-[10px] px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 disabled:opacity-50 transition-colors flex-shrink-0"
        >
          {scanning ? '⟳ scanning…' : '⟳ rescan'}
        </button>
      </div>
      {scanError && <div className="text-[10px] text-red-400">{scanError}</div>}

      {/* Game server open ports */}
      {data.stats.game_open_ports.length > 0 && (
        <div className="az-tile">
          <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5">
            {data.stats.game_server_ip} — Open Ports
          </div>
          <div className="flex flex-wrap gap-1">
            {data.stats.game_open_ports.map((p) => {
              const svcName = data.stats.game_services[p]
              const isRisky = [22, 8080, 8880, 2022].includes(p)
              return (
                <span
                  key={p}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                    isRisky ? 'bg-amber-500/15 text-amber-400' : 'bg-zinc-700/50 text-zinc-400'
                  }`}
                >
                  {p}{svcName ? ` ${svcName}` : ''}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Category rollup */}
      {Object.keys(byCat).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(byCat).map(([cat, n]) => (
            <span key={cat} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-zinc-800/60 text-zinc-400">
              {CAT_LABELS[cat] ?? cat}
              <span className="text-zinc-300 font-medium">{n}</span>
            </span>
          ))}
        </div>
      )}

      {/* Full findings accordion */}
      {data.findings.length > 0 ? (
        <div className="space-y-0.5">
          <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">All Findings</div>
          {data.findings.map((f) => {
            const s = SEV[f.severity]
            const isExpanded = expanded === f.id
            return (
              <div key={f.id} className="rounded-lg overflow-hidden">
                <button
                  className={`w-full flex items-start gap-2 px-2.5 py-2 text-left transition-colors ${
                    isExpanded ? 'bg-zinc-800/80' : 'bg-zinc-800/30 hover:bg-zinc-800/60'
                  }`}
                  onClick={() => setExpanded(isExpanded ? null : f.id)}
                >
                  <StatusDot tone={SEV_TONE[f.severity]} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-200 leading-tight">{f.title}</div>
                    <div className="text-[10px] text-zinc-500 truncate mt-0.5">{f.detail}</div>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded flex-shrink-0 font-medium ${s.bg} ${s.text} mt-0.5`}>
                    {CAT_LABELS[f.category] ?? f.category}
                  </span>
                  <span className="text-zinc-700 text-[10px] flex-shrink-0 mt-1">{isExpanded ? '▲' : '▼'}</span>
                </button>
                {isExpanded && (
                  <div className="bg-zinc-800/50 px-4 py-2.5 border-t border-zinc-700/40 space-y-1">
                    <div className="text-[10px] text-zinc-400">{f.detail}</div>
                    {f.recommendation && (
                      <div className="text-[10px] text-indigo-300">
                        <span className="text-zinc-600">↪ </span>{f.recommendation}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-3 text-emerald-400/90 text-xs">✓ No findings — everything looks clean</div>
      )}
    </div>
  )
}
