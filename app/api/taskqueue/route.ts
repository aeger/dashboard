import { NextResponse } from 'next/server'

export interface TaskItem {
  id: string
  title: string
  description: string | null
  status: string
  priority: number
  source: string | null
  target: string | null
  claimed_by: string | null
  claimed_at: string | null
  created_at: string
  updated_at: string
  tags: string[] | null
  result: string | null
  error: string | null
  blocked_reason: string | null
  failure_mode: string | null
  attempt_count: number
}

export interface TaskQueueData {
  problems: TaskItem[]
  waiting: TaskItem[]
  active: TaskItem[]
  recent: TaskItem[]
  summary24h: Record<string, number>
}

// Keep old export name for any existing imports
export type TaskQueueStats = TaskQueueData

const SELECT = 'id,title,description,status,priority,source,target,claimed_by,claimed_at,created_at,updated_at,tags,result,error,blocked_reason,failure_mode,attempt_count'

export async function GET() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
  const base = `${url}/rest/v1/task_queue`
  const opts = { headers, cache: 'no-store' as const }

  try {
    const [problemsRes, waitingRes, activeRes, recentRes, summary24hRes] = await Promise.all([
      // Problem flags: failed or escalated (exclude completed/expired)
      fetch(
        `${base}?select=${SELECT}&or=(status.eq.failed,status.eq.escalated)&order=updated_at.desc&limit=20`,
        opts
      ),
      // Waiting: blocked, delegated, or pending_eval (needs Iris review)
      fetch(
        `${base}?select=${SELECT}&or=(status.eq.blocked,status.eq.delegated,status.eq.pending_eval)&order=updated_at.desc&limit=10`,
        opts
      ),
      // Active: claimed (running)
      fetch(
        `${base}?select=${SELECT}&status=eq.claimed&order=claimed_at.asc`,
        opts
      ),
      // Recent 20 by updated_at
      fetch(
        `${base}?select=${SELECT}&order=updated_at.desc&limit=20`,
        opts
      ),
      // Last 24h for summary
      fetch(
        `${base}?select=status&updated_at=gte.${new Date(Date.now() - 86400000).toISOString()}`,
        opts
      ),
    ])

    const [problemsRaw, waitingRaw, activeRaw, recentRaw, summary24hRaw]: [TaskItem[], TaskItem[], TaskItem[], TaskItem[], Array<{ status: string }>] = await Promise.all([
      problemsRes.ok ? problemsRes.json() : [],
      waitingRes.ok ? waitingRes.json() : [],
      activeRes.ok ? activeRes.json() : [],
      recentRes.ok ? recentRes.json() : [],
      summary24hRes.ok ? summary24hRes.json() : [],
    ])

    const summary24h: Record<string, number> = {}
    for (const { status } of summary24hRaw) {
      summary24h[status] = (summary24h[status] ?? 0) + 1
    }

    return NextResponse.json({
      problems: problemsRaw,
      waiting: waitingRaw,
      active: activeRaw,
      recent: recentRaw,
      summary24h,
    } satisfies TaskQueueData)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch task queue' }, { status: 500 })
  }
}
