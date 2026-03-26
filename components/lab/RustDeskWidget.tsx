'use client'

import { useEffect, useState } from 'react'

interface RustDeskDevice {
  id: string
  name: string
  icon?: string
}

interface RustDeskStatus {
  configured: boolean
  hbbs?: boolean
  hbbr?: boolean
  host?: string
  key?: string
  devices?: RustDeskDevice[]
}

export default function RustDeskWidget() {
  const [status, setStatus] = useState<RustDeskStatus | null>(null)
  const [quickId, setQuickId] = useState('')
  const [showQuick, setShowQuick] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/rustdesk')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {})
  }, [])

  function handleConnect(peerId: string) {
    if (!status?.host) return
    window.open(`rustdesk://connection/new/${peerId}`, '_self')
  }

  function copyId(id: string) {
    navigator.clipboard.writeText(id).then(() => {
      setCopied(id)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  if (!status) return (
    <div className="flex items-center justify-center h-16">
      <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
    </div>
  )

  if (!status.configured) return (
    <div className="text-zinc-500 text-sm text-center py-4">RustDesk not configured</div>
  )

  const serverUp = status.hbbs && status.hbbr
  const devices = status.devices ?? []

  return (
    <div className="space-y-2">
      {/* Server status bar */}
      <div className="flex items-center justify-between text-xs px-1">
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 ${serverUp ? 'text-emerald-400' : 'text-red-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${serverUp ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {serverUp ? 'Server Online' : 'Server Issue'}
          </div>
          {!serverUp && (
            <div className="flex gap-1.5">
              <span className={status.hbbs ? 'text-emerald-400' : 'text-red-400'}>hbbs</span>
              <span className={status.hbbr ? 'text-emerald-400' : 'text-red-400'}>hbbr</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-600">{status.host}</span>
          <button
            onClick={() => setShowQuick(!showQuick)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Quick connect by ID"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Quick connect */}
      {showQuick && (
        <div className="flex gap-2 px-1">
          <input
            type="text"
            value={quickId}
            onChange={(e) => setQuickId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && quickId.trim() && handleConnect(quickId.trim())}
            placeholder="Enter Peer ID"
            className="flex-1 px-2.5 py-1 rounded bg-zinc-800 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            autoFocus
          />
          <button
            onClick={() => { if (quickId.trim()) handleConnect(quickId.trim()) }}
            disabled={!quickId.trim()}
            className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs transition-colors disabled:opacity-40"
          >
            Connect
          </button>
        </div>
      )}

      {/* Device list */}
      {devices.length > 0 && (
        <div className="space-y-0.5">
          {devices.map((device) => (
            <div
              key={device.id}
              className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-zinc-800/40 hover:bg-zinc-800/70 transition-colors group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <DeviceIcon type={device.icon} />
                <div className="min-w-0">
                  <div className="text-sm text-zinc-200 truncate">{device.name}</div>
                  <button
                    onClick={() => copyId(device.id)}
                    className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors font-mono"
                    title="Copy ID"
                  >
                    {copied === device.id ? 'Copied!' : `ID: ${device.id}`}
                  </button>
                </div>
              </div>
              <button
                onClick={() => handleConnect(device.id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs transition-colors"
                title={`Connect to ${device.name}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v3.009a7.006 7.006 0 00-1-.417V3.5a.5.5 0 00-.5-.5h-9a.5.5 0 00-.5.5v6a.5.5 0 00.5.5h3.083A7.026 7.026 0 006 11H3.5A1.5 1.5 0 012 9.5v-6z" />
                  <path d="M12 16a4 4 0 100-8 4 4 0 000 8zm-.75-5.25a.75.75 0 011.5 0v.75h.75a.75.75 0 010 1.5h-.75v.75a.75.75 0 01-1.5 0v-.75h-.75a.75.75 0 010-1.5h.75v-.75z" />
                </svg>
                Connect
              </button>
            </div>
          ))}
        </div>
      )}

      {devices.length === 0 && (
        <div className="text-zinc-500 text-xs text-center py-3">No devices configured</div>
      )}
    </div>
  )
}

function DeviceIcon({ type }: { type?: string }) {
  if (type === 'server') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-zinc-500 flex-shrink-0">
        <path d="M4.632 3.533A2 2 0 016.577 2h6.846a2 2 0 011.945 1.533l1.976 8.234A3.489 3.489 0 0016 11.5H4c-.476 0-.93.095-1.344.267l1.976-8.234z" />
        <path fillRule="evenodd" d="M4 13a2 2 0 100 4h12a2 2 0 100-4H4zm11.24 2a.75.75 0 01.75-.75H16a.75.75 0 01.75.75v.01a.75.75 0 01-.75.75h-.01a.75.75 0 01-.75-.75V15zm-2.25-.75a.75.75 0 00-.75.75v.01c0 .414.336.75.75.75H13a.75.75 0 00.75-.75V15a.75.75 0 00-.75-.75h-.01z" clipRule="evenodd" />
      </svg>
    )
  }
  // Desktop
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-zinc-500 flex-shrink-0">
      <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 014.25 2h11.5A2.25 2.25 0 0118 4.25v8.5A2.25 2.25 0 0115.75 15h-3.105a3.501 3.501 0 001.1 1.677A.75.75 0 0113.26 18H6.74a.75.75 0 01-.484-1.323A3.501 3.501 0 007.355 15H4.25A2.25 2.25 0 012 12.75v-8.5zm1.5 0a.75.75 0 01.75-.75h11.5a.75.75 0 01.75.75v7.5a.75.75 0 01-.75.75H4.25a.75.75 0 01-.75-.75v-7.5z" clipRule="evenodd" />
    </svg>
  )
}
