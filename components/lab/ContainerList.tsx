'use client'

import { useEffect, useState } from 'react'
import StatusBadge from '@/components/shared/StatusBadge'
import type { Container } from '@/lib/portainer'

export default function ContainerList() {
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/containers')
      .then((r) => r.json())
      .then((d) => setContainers(d.containers ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))

    const interval = setInterval(() => {
      fetch('/api/containers')
        .then((r) => r.json())
        .then((d) => setContainers(d.containers ?? []))
        .catch(() => {})
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-24">
      <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
    </div>
  )

  if (containers.length === 0) return (
    <div className="text-zinc-500 text-sm text-center py-6">Portainer not configured</div>
  )

  return (
    <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
      {containers.map((c) => (
        <div key={c.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-zinc-800/40 hover:bg-zinc-800/70 transition-colors">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-zinc-200 truncate">{c.name}</div>
            <div className="text-xs text-zinc-500 truncate">{c.image.split(':')[0].split('/').pop()}</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <span className="text-xs text-zinc-600">{c.endpoint}</span>
            <StatusBadge status={c.state} />
          </div>
        </div>
      ))}
    </div>
  )
}
