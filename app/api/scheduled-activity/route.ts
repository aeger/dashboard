import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export interface ScheduledRun {
  run_at: string
  status?: string
  result_summary?: string | null
  duration_sec?: number | null
  notes?: string | null
}

export interface ScheduledActivity {
  id: string
  name: string
  display_name: string | null
  description: string | null
  kind: 'systemd' | 'cron' | 'ccr_trigger' | 'agent_loop' | 'task_queue_recurring'
  schedule: string
  schedule_tz: string
  enabled: boolean
  paused_at: string | null
  pause_reason: string | null
  unpause_at: string | null
  source_ref: Record<string, unknown>
  last_run_at: string | null
  last_status: string | null
  last_result_summary: string | null
  next_run_at: string | null
  run_count: number
  runs: ScheduledRun[]
  tags: string[]
  created_at: string
  updated_at: string
}

const SELECT = [
  'id', 'name', 'display_name', 'description',
  'kind', 'schedule', 'schedule_tz',
  'enabled', 'paused_at', 'unpause_at', 'pause_reason',
  'source_ref',
  'last_run_at', 'last_status', 'last_result_summary', 'next_run_at',
  'run_count', 'runs',
  'tags', 'created_at', 'updated_at',
].join(',')

export async function GET() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  try {
    const res = await fetch(
      // Sort: pinned/disabled at the bottom, paused below active, then most-recently-run first.
      // Supabase doesn't support multi-key sort with derived order so we do it client-side.
      `${url}/rest/v1/scheduled_activity?select=${SELECT}&order=last_run_at.desc.nullslast,name.asc&limit=200`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      },
    )
    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json({ error: `Upstream ${res.status}: ${body.slice(0, 200)}` }, { status: 502 })
    }
    const rows: ScheduledActivity[] = await res.json()

    // Stable client-side sort: enabled+running first (by last_run_at desc),
    // then paused, then disabled. Within each bucket, recent fires bubble up.
    const bucket = (r: ScheduledActivity) => {
      if (!r.enabled) return 2
      if (r.paused_at) return 1
      return 0
    }
    rows.sort((a, b) => {
      const db = bucket(a) - bucket(b)
      if (db !== 0) return db
      const ar = a.last_run_at ?? ''
      const br = b.last_run_at ?? ''
      return br.localeCompare(ar)
    })

    // Group counts by kind for the UI summary header
    const kindCounts: Record<string, number> = {}
    for (const r of rows) {
      kindCounts[r.kind] = (kindCounts[r.kind] ?? 0) + 1
    }

    return NextResponse.json({
      activities: rows,
      kindCounts,
      total: rows.length,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
