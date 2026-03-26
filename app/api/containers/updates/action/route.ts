import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const STATE_FILE = join(process.cwd(), 'data', 'update_state.json')
const VALID_ACTIONS = ['update_now', 'schedule', 'skip'] as const

export async function POST(req: NextRequest) {
  // Auth is enforced at Traefik level (lan-allow@file middleware).
  // Cookie presence check as basic sanity — real auth is at the reverse proxy.
  const cookie = req.headers.get('cookie') || ''
  if (!cookie.includes('authelia_session')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { container, action } = await req.json()

    if (!container || typeof container !== 'string' || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // Read current state
    const state = existsSync(STATE_FILE)
      ? JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
      : { containers: {}, global_policy: {} }

    const now = new Date().toISOString()
    const entry = state.containers[container] || {}

    if (action === 'update_now') {
      entry.status = 'requested'
      entry.requested_at = now
    } else if (action === 'schedule') {
      // Schedule for next 3:47 AM UTC
      const target = new Date()
      target.setUTCHours(3, 47, 0, 0)
      if (target.getTime() <= Date.now()) {
        target.setUTCDate(target.getUTCDate() + 1)
      }
      entry.status = 'scheduled'
      entry.scheduled_time = target.toISOString()
    } else if (action === 'skip') {
      const days = state.global_policy?.skip_reassess_days || 30
      const reassess = new Date(Date.now() + days * 86400000)
      entry.status = 'skipped'
      entry.skipped_at = now
      entry.skip_reassess_at = reassess.toISOString()
    }

    state.containers[container] = entry
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n')

    return NextResponse.json({ success: true, status: entry.status })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
