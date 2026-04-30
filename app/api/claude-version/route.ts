import { NextResponse } from 'next/server'
import { sshExec } from '@/lib/ssh-exec'

export async function GET() {
  try {
    const [currentRaw, latestRaw] = await Promise.all([
      sshExec('/home/almty1/.bun/bin/claude --version 2>/dev/null', 15_000),
      sshExec('/usr/bin/npm view @anthropic-ai/claude-code version 2>/dev/null', 20_000),
    ])

    // "2.1.114 (Claude Code)" → "2.1.114"
    const current = currentRaw.trim().split(' ')[0]
    const latest = latestRaw.trim()
    const updateAvailable = latest.length > 0 && current !== latest

    return NextResponse.json({ current, latest, updateAvailable })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
