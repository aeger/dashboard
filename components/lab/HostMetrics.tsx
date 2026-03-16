'use client'

import { useEffect, useState } from 'react'
import type { HostMetrics as HostMetricsType } from '@/lib/prometheus'

function getBarColor(value: number): string {
  if (value >= 90) return 'bg-red-500'
  if (value >= 75) return 'bg-amber-500'
  return 'bg-blue-500'
}

function MiniBar({ value, label, detail }: { value: number | null; label: string; detail?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-300">
          {value != null ? `${value}%` : '—'}
          {detail && <span className="text-zinc-600 ml-1">{detail}</span>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-700 overflow-hidden">
        {value != null && (
          <div
            className={`h-full rounded-full transition-all ${getBarColor(value)}`}
            style={{ width: `${Math.min(100, value)}%` }}
          />
        )}
      </div>
    </div>
  )
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB/s`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB/s`
  return `${Math.round(bytes)} B/s`
}

export default function HostMetrics() {
  const [metrics, setMetrics] = useState<HostMetricsType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/metrics')
      .then((r) => r.json())
      .then((d) => setMetrics(d.metrics ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))

    const interval = setInterval(() => {
      fetch('/api/metrics')
        .then((r) => r.json())
        .then((d) => setMetrics(d.metrics ?? []))
        .catch(() => {})
    }, 30000)
    return () => clearInterval(interval)
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
    <div className="space-y-4">
      {metrics.map((host) => (
        <div key={host.instance} className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-zinc-200">{host.name}</div>
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              {host.uptime_days != null && <span>Up {Math.floor(host.uptime_days)}d</span>}
              {host.load_1m != null && <span>Load {host.load_1m}</span>}
            </div>
          </div>

          <MiniBar
            label="CPU"
            value={host.cpu_percent}
          />
          <MiniBar
            label="RAM"
            value={host.ram_used_percent}
            detail={host.ram_used_gb != null && host.ram_total_gb != null ? `${host.ram_used_gb}/${host.ram_total_gb} GB` : undefined}
          />
          <MiniBar
            label="Disk"
            value={host.disk_used_percent}
            detail={host.disk_used_gb != null && host.disk_total_gb != null ? `${host.disk_used_gb}/${host.disk_total_gb} GB` : undefined}
          />

          <div className="flex justify-between text-xs pt-0.5">
            <span className="text-zinc-500">Network</span>
            <span className="text-zinc-400">
              ↓ {formatBytes(host.net_rx_bytes)} &nbsp; ↑ {formatBytes(host.net_tx_bytes)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
