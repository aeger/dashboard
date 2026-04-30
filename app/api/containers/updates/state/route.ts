import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const UPDATES_FILE = join(process.cwd(), 'data', 'updates.json')
const STATE_FILE = join(process.cwd(), 'data', 'update_state.json')

interface UpdateContainer {
  name: string
  [key: string]: unknown
}

interface StateEntry {
  status: string
  [key: string]: unknown
}

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const updates = existsSync(UPDATES_FILE)
      ? JSON.parse(readFileSync(UPDATES_FILE, 'utf-8'))
      : { containers: [], checked_at: null }

    const state = existsSync(STATE_FILE)
      ? JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
      : { containers: {}, global_policy: {} }

    const stateMap: Record<string, StateEntry> = state.containers || {}

    const merged = (updates.containers || []).map((c: UpdateContainer) => {
      const s = stateMap[c.name]
      // Stale-state guard: if check-updates detects a NEW image for this container
      // (has_update=true), then a previous-round's "completed" status is by
      // definition stale — that completion was for an OLDER image. Reset to
      // pending_review so the UI surfaces the new update. Other in-flight states
      // (scheduled, in_progress, skipped, pending_review) carry through.
      let user_status: string
      if (s?.status) {
        if (c.has_update && s.status === 'completed') {
          user_status = 'pending_review'
        } else {
          user_status = s.status as string
        }
      } else {
        user_status = c.has_update ? 'pending_review' : 'current'
      }
      return {
        ...c,
        user_status,
        scheduled_time: s?.scheduled_time || null,
        skipped_at: s?.skipped_at || null,
        skip_reassess_at: s?.skip_reassess_at || null,
        completed_at: s?.completed_at || null,
        last_result: s?.last_result || null,
        state_risk: s?.risk || null,
      }
    })

    return NextResponse.json({
      ...updates,
      containers: merged,
      policy: state.global_policy || {},
    })
  } catch {
    return NextResponse.json({ containers: [], checked_at: null, policy: {} })
  }
}
