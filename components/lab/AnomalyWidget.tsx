'use client'

import { useEffect, useState } from 'react'

type Severity = 'info' | 'warn' | 'crit'

interface Anomaly {
  id: string
  kind: 'volume_spike' | 'decision_shift' | 'disallowed_resource' | 'suspicious_cot'
  severity: Severity
  agent: string
  title: string
  detail: string
  evidence?: { activity_id?: string; snippet?: string; created_at?: string }
  metric?: Record<string, number>
}

interface Resp {
  window_hours: number
  scanned_events: number
  agents: string[]
  counts: { crit: number; warn: number; info: number }
  anomalies: Anomaly[]
}

const SEV_STYLE: Record<Severity, { dot: string; badge: string; label: string }> = {
  crit: { dot: 'bg-red-400 animate-pulse', badge: 'bg-red-900/50 text-red-300 border-red-700/50',     label: 'CRIT' },
  warn: { dot: 'bg-amber-400',              badge: 'bg-amber-900/40 text-amber-300 border-amber-700/40', label: 'WARN' },
  info: { dot: 'bg-blue-400',               badge: 'bg-blue-900/40 text-blue-300 border-blue-700/40',    label: 'INFO' },
}

const KIND_LABEL: Record<Anomaly['kind'], string> = {
  volume_spike:        'Volume',
  decision_shift:      'Pattern',
  disallowed_resource: 'Access',
  suspicious_cot:      'CoT',
}

function formatAge(iso?: string): string {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

export default function AnomalyWidget() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function poll() {
      try {
        const r = await fetch('/api/anomalies')
        const j = await r.json()
        if (mounted && !j.error) setData(j)
      } catch {}
      if (mounted) setLoading(false)
    }
    poll()
    const iv = setInterval(poll, 30_000)
    return () => { mounted = false; clearInterval(iv) }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-20">
        <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
      </div>
    )
  }
  if (!data) {
    return <div className="text-xs text-zinc-600 text-center py-4">Anomaly detector unavailable</div>
  }

  const { anomalies, counts, scanned_events, window_hours } = data

  return (
    <div className="space-y-3">
      {/* Header summary */}
      <div className="flex items-center gap-3 text-xs">
        <span className="text-zinc-500">Scanned <span className="text-zinc-200 font-medium">{scanned_events.toLocaleString()}</span> events / {window_hours}h</span>
        <div className="flex items-center gap-2 ml-auto">
          {(['crit', 'warn', 'info'] as const).map((s) => (
            counts[s] > 0 ? (
              <span key={s} className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wide ${SEV_STYLE[s].badge}`}>
                {counts[s]} {s}
              </span>
            ) : null
          ))}
          {anomalies.length === 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-emerald-900/40 text-emerald-300 border-emerald-700/40 uppercase tracking-wide">
              All clear
            </span>
          )}
        </div>
      </div>

      {/* Anomaly list */}
      {anomalies.length === 0 ? (
        <div className="text-xs text-zinc-600 text-center py-3">No anomalies detected in last 24h.</div>
      ) : (
        <div className="space-y-1.5">
          {anomalies.map((a) => {
            const style = SEV_STYLE[a.severity]
            const isOpen = expanded === a.id
            return (
              <div key={a.id} className="bg-zinc-800/40 rounded-lg border border-zinc-800/70">
                <button
                  onClick={() => setExpanded(isOpen ? null : a.id)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-zinc-800/60 transition-colors rounded-lg"
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide flex-shrink-0 ${style.badge}`}>
                    {style.label}
                  </span>
                  <span className="text-[10px] text-zinc-500 flex-shrink-0 uppercase tracking-wider">
                    {KIND_LABEL[a.kind]}
                  </span>
                  <span className="text-xs text-zinc-200 truncate flex-1">{a.title}</span>
                  <span className="text-[10px] text-zinc-600 flex-shrink-0">{a.agent}</span>
                  {a.evidence?.created_at && (
                    <span className="text-[10px] text-zinc-700 flex-shrink-0">{formatAge(a.evidence.created_at)}</span>
                  )}
                </button>
                {isOpen && (
                  <div className="px-3 pb-2.5 pt-1 space-y-1.5 text-xs border-t border-zinc-800/70">
                    <div className="text-zinc-400">{a.detail}</div>
                    {a.metric && (
                      <div className="flex flex-wrap gap-2 text-[10px] text-zinc-500">
                        {Object.entries(a.metric).map(([k, v]) => (
                          <span key={k} className="font-mono bg-zinc-900/60 px-1.5 py-0.5 rounded">
                            {k}: <span className="text-zinc-300">{v}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {a.evidence?.snippet && (
                      <pre className="text-[10px] text-zinc-400 bg-zinc-900/60 rounded p-2 whitespace-pre-wrap break-all font-mono leading-snug max-h-32 overflow-y-auto">
                        {a.evidence.snippet}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Heuristic legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-600 border-t border-zinc-800/50 pt-2">
        <span className="uppercase tracking-wider text-zinc-700">Heuristics:</span>
        <span>Volume — events/min vs 6h baseline</span>
        <span>·</span>
        <span>Pattern — tool/think ratio drift</span>
        <span>·</span>
        <span>Access — sensitive tool patterns</span>
        <span>·</span>
        <span>CoT — test-awareness phrases</span>
      </div>
    </div>
  )
}
