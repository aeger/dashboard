'use client'

import { useEffect, useState } from 'react'

interface RustDeskStatus {
  configured: boolean
  hbbs?: boolean
  hbbr?: boolean
  host?: string
  key?: string
}

export default function RustDeskWidget() {
  const [status, setStatus] = useState<RustDeskStatus | null>(null)
  const [peerId, setPeerId] = useState('')

  useEffect(() => {
    fetch('/api/rustdesk')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {})
  }, [])

  if (!status) return (
    <div className="flex items-center justify-center h-16">
      <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
    </div>
  )

  if (!status.configured) return (
    <div className="text-zinc-500 text-sm text-center py-4">RustDesk not configured</div>
  )

  function handleConnect() {
    if (!peerId.trim() || !status?.host) return
    window.open(`rustdesk://connect?id=${peerId.trim()}&relay=${status.host}`, '_self')
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${status.hbbs ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${status.hbbs ? 'bg-emerald-400' : 'bg-red-400'}`} />
          hbbs
        </div>
        <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${status.hbbr ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${status.hbbr ? 'bg-emerald-400' : 'bg-red-400'}`} />
          hbbr
        </div>
        <span className="text-xs text-zinc-500 self-center">{status.host}</span>
      </div>

      {status.key && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Key:</span>
          <code className="text-xs text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded font-mono truncate flex-1">{status.key}</code>
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={peerId}
          onChange={(e) => setPeerId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
          placeholder="Peer ID"
          className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
        />
        <button
          onClick={handleConnect}
          disabled={!peerId.trim()}
          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-40"
        >
          Connect
        </button>
      </div>
    </div>
  )
}
