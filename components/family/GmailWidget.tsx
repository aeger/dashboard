'use client'

import { useEffect, useState } from 'react'

interface GmailMessage {
  id: string
  threadId: string
  from: string
  subject: string
  snippet: string
  date: string
  unread: boolean
}

interface GmailState {
  status: 'loading' | 'unauthenticated' | 'ready' | 'error'
  messages: GmailMessage[]
}

const AUTH_LOGIN_URL = 'https://auth.az-lab.dev/?rd=https://home.az-lab.dev'
const REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes

export default function GmailWidget() {
  const [state, setState] = useState<GmailState>({ status: 'loading', messages: [] })

  async function load() {
    try {
      const res = await fetch('/api/gmail')
      const data = await res.json()

      if (!data.authenticated) {
        setState({ status: 'unauthenticated', messages: [] })
        return
      }

      if (data.error) {
        setState({ status: 'error', messages: [] })
        return
      }

      setState({ status: 'ready', messages: data.messages ?? [] })
    } catch {
      setState({ status: 'error', messages: [] })
    }
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, REFRESH_INTERVAL)
    return () => clearInterval(timer)
  }, [])

  if (state.status === 'loading') {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
      </div>
    )
  }

  if (state.status === 'unauthenticated') {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <div className="text-zinc-500 text-sm">Sign in to view your inbox</div>
        <a
          href={AUTH_LOGIN_URL}
          className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm text-zinc-300 hover:text-white transition-all"
        >
          Sign in
        </a>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="text-zinc-500 text-sm text-center py-8">
        Unable to load mail
      </div>
    )
  }

  if (state.messages.length === 0) {
    return (
      <div className="text-zinc-500 text-sm text-center py-8">
        Inbox zero — nice work
      </div>
    )
  }

  const unreadCount = state.messages.filter((m) => m.unread).length

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        {unreadCount > 0 && (
          <span className="text-xs text-blue-400">
            {unreadCount} unread
          </span>
        )}
        <button
          onClick={load}
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors ml-auto"
        >
          refresh
        </button>
      </div>

      <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
        {state.messages.map((msg) => (
          <li key={msg.id}>
            <a
              href={`https://mail.google.com/mail/u/0/#inbox/${msg.threadId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block group py-1.5"
            >
              <div className="flex items-start gap-2">
                {msg.unread && (
                  <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                )}
                <div className={`flex-1 min-w-0 ${!msg.unread ? 'ml-4' : ''}`}>
                  <div className="flex justify-between gap-2">
                    <span className={`text-sm truncate ${msg.unread ? 'text-zinc-100 font-medium' : 'text-zinc-300'} group-hover:text-white transition-colors`}>
                      {parseSender(msg.from)}
                    </span>
                    <span className="text-xs text-zinc-500 flex-shrink-0 mt-0.5">
                      {formatDate(msg.date)}
                    </span>
                  </div>
                  <div className={`text-sm truncate ${msg.unread ? 'text-zinc-300' : 'text-zinc-400'}`}>
                    {msg.subject}
                  </div>
                  <div className="text-xs text-zinc-600 truncate mt-0.5">
                    {msg.snippet}
                  </div>
                </div>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function parseSender(from: string): string {
  // "Jeff Cook <jeff@gmail.com>" → "Jeff Cook"
  const match = from.match(/^"?([^"<]+)"?\s*</)
  return match ? match[1].trim() : from.split('@')[0]
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = (now.getTime() - d.getTime()) / 1000 / 60

    if (diff < 60) return `${Math.round(diff)}m`
    if (diff < 1440) return `${Math.round(diff / 60)}h`

    // Same year: "Mar 15"
    if (d.getFullYear() === now.getFullYear()) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  } catch {
    return ''
  }
}
