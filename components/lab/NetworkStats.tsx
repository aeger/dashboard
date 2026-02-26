'use client'

import { useEffect, useState } from 'react'

interface DnsStats {
  total_dns_queries: number
  blocked_filtering: number
  blocked_percent: number
  top_queried_domains: { name: string; count: number }[]
  top_clients: { name: string; count: number }[]
  error?: string
}

export default function NetworkStats() {
  const [stats, setStats] = useState<DnsStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dns')
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {})
      .finally(() => setLoading(false))

    const interval = setInterval(() => {
      fetch('/api/dns')
        .then((r) => r.json())
        .then((d) => setStats(d))
        .catch(() => {})
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-24">
      <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
    </div>
  )

  if (!stats || stats.error) return (
    <div className="text-zinc-500 text-sm text-center py-6">AdGuard not configured</div>
  )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
          <div className="text-lg font-semibold text-white">{formatNum(stats.total_dns_queries)}</div>
          <div className="text-xs text-zinc-500">Queries / 24h</div>
        </div>
        <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
          <div className="text-lg font-semibold text-red-400">{stats.blocked_percent}%</div>
          <div className="text-xs text-zinc-500">Blocked</div>
        </div>
      </div>

      {stats.top_clients.length > 0 && (
        <div>
          <div className="text-xs text-zinc-500 mb-1">Top clients</div>
          {stats.top_clients.slice(0, 4).map((c, i) => (
            <div key={i} className="flex justify-between text-xs py-0.5">
              <span className="text-zinc-300 truncate">{c.name}</span>
              <span className="text-zinc-500 ml-2">{formatNum(c.count)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
