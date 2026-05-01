import { NextResponse } from 'next/server'
import { sshExec } from '@/lib/ssh-exec'

let cachedLatest: { value: string; at: number } | null = null
const LATEST_TTL_MS = 60 * 60_000

export async function GET() {
  const [currentRes, latestRes] = await Promise.allSettled([
    sshExec('/home/almty1/.bun/bin/claude --version 2>/dev/null', 15_000),
    sshExec('/usr/bin/npm view @anthropic-ai/claude-code version 2>/dev/null', 20_000),
  ])

  if (currentRes.status !== 'fulfilled' || !currentRes.value.trim()) {
    const reason = currentRes.status === 'rejected' ? String(currentRes.reason) : 'empty output'
    return NextResponse.json({ error: `current version unavailable: ${reason}` }, { status: 500 })
  }

  // "2.1.114 (Claude Code)" → "2.1.114"
  const current = currentRes.value.trim().split(' ')[0]

  let latest = ''
  if (latestRes.status === 'fulfilled' && latestRes.value.trim()) {
    latest = latestRes.value.trim()
    cachedLatest = { value: latest, at: Date.now() }
  } else if (cachedLatest && Date.now() - cachedLatest.at < LATEST_TTL_MS) {
    latest = cachedLatest.value
  } else {
    latest = current
  }

  const updateAvailable = latest.length > 0 && current !== latest
  return NextResponse.json({ current, latest, updateAvailable })
}
