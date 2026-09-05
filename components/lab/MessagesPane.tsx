'use client'

import { useEffect, useRef, useState } from 'react'
import type { AgentMessage } from '@/app/api/messages/route'

// Relay chat pane — live agent_messages via SSE (/api/messages/stream),
// send as Jeff via POST /api/messages. See Relay plan 2026-08-29.

const AGENT_COLORS: Record<string, string> = {
  wren:   '#60a5fa', // blue
  atlas:  '#34d399', // emerald
  iris:   '#c084fc', // purple
  volt:   '#fbbf24', // amber
  jeff:   '#f472b6', // pink
  system: '#a1a1aa', // zinc
}

const KIND_BADGE: Record<string, string> = {
  task: 'bg-amber-900/50 text-amber-300',
  status: 'bg-zinc-800 text-zinc-400',
  system: 'bg-zinc-800 text-zinc-500',
}

const TARGETS = [
  { value: '', label: 'Everyone (broadcast)' },
  { value: 'wren', label: 'Wren (server)' },
  { value: 'atlas', label: 'Atlas (Windows)' },
  { value: 'iris', label: 'Iris (Cowork)' },
]

function fmtTime(iso: string): string {
  // Arizona MST = UTC-7, no DST
  const d = new Date(new Date(iso).getTime() - 7 * 3600 * 1000)
  return d.toISOString().slice(11, 16)
}

export default function MessagesPane() {
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [connected, setConnected] = useState(false)
  const [draft, setDraft] = useState('')
  const [target, setTarget] = useState('wren')
  const [kind, setKind] = useState<'chat' | 'task'>('chat')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const seenIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    const es = new EventSource('/api/messages/stream')
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { rows: AgentMessage[]; type: 'init' | 'delta' }
        if (data.type === 'init') {
          seenIds.current = new Set(data.rows.map(r => r.id))
          setMessages(data.rows)
          setConnected(true)
        } else if (data.rows.length > 0) {
          const fresh = data.rows.filter(r => !seenIds.current.has(r.id))
          fresh.forEach(r => seenIds.current.add(r.id))
          if (fresh.length > 0) setMessages(prev => [...prev, ...fresh].slice(-500))
        }
      } catch { /* malformed frame — ignore */ }
    }
    es.onerror = () => setConnected(false)
    es.onopen = () => setConnected(true)
    return () => es.close()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function send() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_agent: target || null, kind, body: text }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`)
      } else {
        setDraft('')
        // Optimistic append; SSE dedupe via seenIds prevents doubles
        if (data.message && !seenIds.current.has(data.message.id)) {
          seenIds.current.add(data.message.id)
          setMessages(prev => [...prev, data.message])
        }
      }
    } catch {
      setError('Network error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-950/60 h-[calc(100vh-180px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-200">Agent Relay</h2>
          <span className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <span className="text-xs text-zinc-500">{connected ? 'live' : 'reconnecting…'}</span>
        </div>
        <span className="text-xs text-zinc-600">{messages.length} messages</span>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-sm text-zinc-600 text-center pt-10">
            No messages yet. Say something — Wren and Atlas are listening.
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className="flex items-start gap-2 text-sm">
            <span className="text-[10px] text-zinc-600 pt-1 w-10 flex-shrink-0 font-mono">{fmtTime(m.created_at)}</span>
            <span className="font-semibold flex-shrink-0" style={{ color: AGENT_COLORS[m.from_agent] ?? '#a1a1aa' }}>
              {m.from_agent}
            </span>
            <span className="text-zinc-600 flex-shrink-0">→ {m.to_agent ?? 'all'}</span>
            {m.kind !== 'chat' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${KIND_BADGE[m.kind] ?? 'bg-zinc-800 text-zinc-400'}`}>
                {m.kind}{m.task_id ? ' ↗' : ''}
              </span>
            )}
            <span className="text-zinc-300 whitespace-pre-wrap break-words min-w-0">{m.body}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-zinc-800 p-3 space-y-2">
        {error && <div className="text-xs text-red-400">{error}</div>}
        <div className="flex gap-2">
          <select
            value={target}
            onChange={e => setTarget(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300"
          >
            {TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select
            value={kind}
            onChange={e => setKind(e.target.value as 'chat' | 'task')}
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300"
          >
            <option value="chat">chat</option>
            <option value="task">task (queues durable work)</option>
          </select>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={kind === 'task' ? 'Describe the task to queue…' : 'Message…'}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600"
          />
          <button
            onClick={send}
            disabled={sending || !draft.trim()}
            className="px-4 py-1.5 rounded text-sm bg-blue-900/60 hover:bg-blue-800/80 text-blue-200 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
