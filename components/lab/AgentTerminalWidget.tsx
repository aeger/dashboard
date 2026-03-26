'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { ActivityRow } from '@/app/api/agent-activity/route'

const TYPE_COLOR: Record<string, string> = {
  thinking:  'text-blue-300',
  tool_call: 'text-yellow-300',
  result:    'text-green-300',
  status:    'text-zinc-300',
  error:     'text-red-300',
  progress:  'text-cyan-300',
}

const TYPE_PREFIX: Record<string, string> = {
  thinking:  '~ ',
  tool_call: '$ ',
  result:    '✓ ',
  status:    '· ',
  error:     '✗ ',
  progress:  '↻ ',
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function TermLine({ row }: { row: ActivityRow }) {
  const color = TYPE_COLOR[row.activity_type] ?? 'text-zinc-400'
  const prefix = TYPE_PREFIX[row.activity_type] ?? '  '
  return (
    <div className="flex gap-2 leading-5 group">
      <span className="text-zinc-700 text-[10px] tabular-nums flex-shrink-0 mt-0.5 group-hover:text-zinc-500">
        {formatTime(row.created_at)}
      </span>
      <span className={`text-[11px] font-mono ${color} break-all`}>
        <span className="opacity-60">{prefix}</span>{row.content}
      </span>
    </div>
  )
}

interface Props {
  agent?: string
}

export default function AgentTerminalWidget({ agent = 'wren' }: Props) {
  const [connected, setConnected] = useState(false)
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const sinceRef = useRef<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  const poll = useCallback(async () => {
    try {
      const url = `/api/agent-activity?agent=${agent}&limit=50${sinceRef.current ? `&since=${encodeURIComponent(sinceRef.current)}` : ''}`
      const res = await fetch(url)
      if (!res.ok) return
      const data = await res.json()
      if (data.rows?.length > 0) {
        setRows((prev) => {
          const combined = sinceRef.current ? [...prev, ...data.rows] : data.rows
          // Cap at 500 lines
          return combined.slice(-500)
        })
        sinceRef.current = data.rows[data.rows.length - 1].created_at
      }
    } catch {
      // silently ignore poll errors
    }
  }, [agent])

  const connect = useCallback(async () => {
    setError(null)
    setRows([])
    sinceRef.current = null
    // Initial load
    try {
      const res = await fetch(`/api/agent-activity?agent=${agent}&limit=50`)
      if (!res.ok) throw new Error('Failed to connect')
      const data = await res.json()
      setRows(data.rows ?? [])
      if (data.rows?.length > 0) {
        sinceRef.current = data.rows[data.rows.length - 1].created_at
      }
      setConnected(true)
      pollRef.current = setInterval(poll, 5000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed')
    }
  }, [agent, poll])

  const disconnect = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null
    setConnected(false)
  }, [])

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  // Auto-scroll to bottom when new rows arrive
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [rows])

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40
  }

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? 'bg-green-400 animate-pulse' : 'bg-zinc-600'}`} />
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
            {connected ? `${agent} · live` : `${agent} · disconnected`}
          </span>
          {connected && (
            <span className="text-[10px] text-zinc-700">{rows.length} lines</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {connected && (
            <button
              onClick={() => { setRows([]); sinceRef.current = null }}
              className="text-[10px] text-zinc-600 hover:text-zinc-400 px-1.5 py-0.5 rounded transition-colors"
            >
              clear
            </button>
          )}
          <button
            onClick={connected ? disconnect : connect}
            className={`text-[10px] font-medium px-2.5 py-1 rounded transition-colors ${
              connected
                ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'
                : 'bg-blue-900/50 text-blue-300 hover:bg-blue-800/60 border border-blue-800/50'
            }`}
          >
            {connected ? 'Disconnect' : 'Connect'}
          </button>
        </div>
      </div>

      {/* Terminal body */}
      <div
        className={`font-mono text-xs rounded-lg border transition-colors ${
          connected ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-950/40 border-zinc-800/40'
        }`}
      >
        {!connected ? (
          <div className="flex flex-col items-center justify-center h-32 gap-3">
            <div className="text-zinc-700 text-[11px] font-mono">
              <span className="text-zinc-600">$</span> connect to observe {agent}
            </div>
            <button
              onClick={connect}
              className="text-[11px] font-medium px-4 py-1.5 rounded bg-blue-900/50 text-blue-300 hover:bg-blue-800/60 border border-blue-800/50 transition-colors"
            >
              Connect
            </button>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-red-400 text-[11px]">{error}</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-zinc-700 text-[11px] font-mono animate-pulse">waiting for activity...</span>
          </div>
        ) : (
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-64 overflow-y-auto p-3 space-y-0.5 scrollbar-thin scrollbar-thumb-zinc-800"
          >
            {rows.map((r) => <TermLine key={r.id} row={r} />)}
            <div className="h-px" />
          </div>
        )}
      </div>
    </div>
  )
}
