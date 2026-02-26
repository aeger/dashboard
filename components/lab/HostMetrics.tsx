'use client'

import { useEffect, useState } from 'react'
import type { HostMetrics as HostMetricsType } from '@/lib/prometheus'

function MiniBar({ value, color }: { value: number | null; color: string }) {
  if (value == null) return <div className="h-1.5 rounded-full bg-zinc-700 flex-1" />
  return (
    <div className="h-1.5 rounded-full bg-zinc-700 flex-1 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  )
}

function MetricRow({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-zinc-500 w-10 flex-shrink-0">{label}</span>
      <MiniBar value={value} color={color} />
      <span className="text-xs text-zinc-300 w-10 text-right flex-shrink-0">
        {value != null ? `${value}%` : '—'}
      </span>
    </div>
  )
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
          <div className="text-sm font-medium text-zinc-200">{host.name}</div>
          <MetricRow label="CPU" value={host.cpu_percent} color="bg-blue-500" />
          <MetricRow label="RAM" value={host.ram_used_percent} color="bg-purple-500" />
          <MetricRow label="Disk" value={host.disk_used_percent} color="bg-amber-500" />
        </div>
      ))}
    </div>
  )
}
