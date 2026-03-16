'use client'

import { useEffect, useState, useCallback } from 'react'
import StatusBadge from '@/components/shared/StatusBadge'
import type { Container } from '@/lib/portainer'

type ActionState = { id: string; action: string } | null

export default function ContainerList() {
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<ActionState>(null)

  const refresh = useCallback(() => {
    fetch('/api/containers')
      .then((r) => r.json())
      .then((d) => setContainers(d.containers ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    setLoading(false)
    const interval = setInterval(refresh, 60000)
    return () => clearInterval(interval)
  }, [refresh])

  async function handleAction(c: Container, action: string) {
    setActing({ id: c.id, action })
    try {
      const res = await fetch('/api/containers/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpointId: c.endpointId, containerId: c.id, action }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        console.error('Container action failed:', data.error)
      }
      // Wait briefly for state to change then refresh
      setTimeout(refresh, 1500)
    } catch (e) {
      console.error('Container action error:', e)
    } finally {
      setActing(null)
    }
  }

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
      {containers.map((c) => {
        const isRunning = c.state === 'running'
        const isBusy = acting?.id === c.id
        return (
          <div key={c.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-zinc-800/40 hover:bg-zinc-800/70 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-zinc-200 truncate">{c.name}</div>
              <div className="text-xs text-zinc-500 truncate">{c.image.split(':')[0].split('/').pop()}</div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
              <span className="text-xs text-zinc-600 mr-1">{c.endpoint}</span>
              {isRunning ? (
                <>
                  <ActionBtn label="Restart" icon="↻" onClick={() => handleAction(c, 'restart')} disabled={isBusy} title="Restart" />
                  <ActionBtn label="Stop" icon="■" onClick={() => handleAction(c, 'stop')} disabled={isBusy} color="text-red-400 hover:bg-red-500/20" title="Stop" />
                </>
              ) : (
                <ActionBtn label="Start" icon="▶" onClick={() => handleAction(c, 'start')} disabled={isBusy} color="text-green-400 hover:bg-green-500/20" title="Start" />
              )}
              {isBusy && <div className="w-3.5 h-3.5 border border-zinc-500 border-t-zinc-200 rounded-full animate-spin" />}
              <StatusBadge status={c.state} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ActionBtn({ label, icon, onClick, disabled, color, title }: {
  label: string; icon: string; onClick: () => void; disabled: boolean; color?: string; title: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors disabled:opacity-30 ${color ?? 'text-zinc-400 hover:bg-zinc-700'}`}
    >
      {icon}
    </button>
  )
}
