'use client'

import { useEffect, useState } from 'react'

export default function GmailReauthBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let mounted = true

    async function check() {
      try {
        const res = await fetch('/api/gmail?max=1')
        if (!res.ok) return
        const data = await res.json()
        if (mounted) setShow(!!data.reauth_required)
      } catch {
        // silent
      }
    }

    check()
    const interval = setInterval(check, 5 * 60 * 1000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  if (!show) return null

  return (
    <div className="mb-4">
      <a
        href="/api/gmail/auth"
        className="flex items-center gap-3 px-4 py-2.5 rounded-xl border bg-yellow-500/10 border-yellow-500/40 hover:bg-yellow-500/20 transition-colors cursor-pointer"
      >
        <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" />
        <span className="text-sm font-medium text-yellow-300">
          Gmail token expired — click to re-authorize
        </span>
        <span className="text-xs text-zinc-500 ml-auto">→ Google OAuth</span>
      </a>
    </div>
  )
}
