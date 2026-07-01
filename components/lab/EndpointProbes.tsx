'use client'

import { useWidgetData } from '@/lib/hooks/useWidgetData'
import type { EndpointProbe } from '@/lib/prometheus'

const scopeBadge: Record<EndpointProbe['scope'], string> = {
  public: 'bg-red-500/15 text-red-300 ring-red-500/20',
  protected: 'bg-amber-500/15 text-amber-300 ring-amber-500/20',
  internal: 'bg-zinc-700/40 text-zinc-400 ring-zinc-600/30',
}

function certColor(days: number | null): string {
  if (days == null) return 'text-zinc-600'
  if (days <= 7) return 'text-red-400'
  if (days <= 21) return 'text-amber-400'
  return 'text-zinc-500'
}

export default function EndpointProbes() {
  const { data, loading, error } = useWidgetData<EndpointProbe[]>('/api/probes', {
    intervalMs: 30000,
    select: (raw) => (raw as { probes?: EndpointProbe[] }).probes ?? [],
  })

  if (loading || data == null)
    return (
      <div className="flex items-center justify-center h-16">
        <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
      </div>
    )

  if (error && data.length === 0)
    return <div className="text-xs text-red-400/80">Endpoint probes unavailable</div>

  if (data.length === 0)
    return <div className="text-xs text-zinc-600 py-2">No endpoint probes configured</div>

  const down = data.filter((p) => !p.success).length

  return (
    <div className="flex flex-col gap-1">
      {down > 0 && (
        <div className="text-[10px] font-semibold text-red-400/80 uppercase tracking-widest mb-1">
          {down} endpoint{down > 1 ? 's' : ''} failing probe
        </div>
      )}
      {data.map((p) => (
        <div
          key={p.url}
          className="flex items-center gap-2 py-1 border-b border-zinc-800/40 last:border-0 min-w-0"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.success ? 'bg-green-400' : 'bg-red-500'}`}
          />
          <a
            href={p.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-zinc-300 hover:text-white truncate"
            title={p.url}
          >
            {p.name}
          </a>
          <span
            className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 shrink-0 ${scopeBadge[p.scope]}`}
          >
            {p.scope}
          </span>
          <span className="ml-auto flex items-center gap-3 shrink-0 tabular-nums">
            {p.cert_expiry_days != null && (
              <span className={`text-[10px] ${certColor(p.cert_expiry_days)}`} title="TLS cert expiry">
                {p.cert_expiry_days}d cert
              </span>
            )}
            <span className="text-[11px] text-zinc-500">
              {p.duration_ms != null ? `${p.duration_ms}ms` : '—'}
            </span>
            <span
              className={`text-[11px] font-semibold ${p.success ? 'text-zinc-400' : 'text-red-400'}`}
            >
              {p.status_code ?? (p.success ? 'OK' : 'DOWN')}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}
