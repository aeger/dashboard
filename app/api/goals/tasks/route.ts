import { NextRequest, NextResponse } from 'next/server'

// Returns task counts + recent task list per goal_id for the given goal IDs.
// GET /api/goals/tasks?goalIds=uuid1,uuid2,...
//
// Per-goal payload:
//   - tasks[goalId].counts        — aggregate progress counts (drives goal progress bar)
//   - tasks[goalId].latest        — single most-recent task (legacy `taskStatus` shape)
//   - tasks[goalId].items         — up to 5 recent tasks (rich rows for the expanded GoalCard)
export async function GET(req: NextRequest) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return NextResponse.json({ tasks: {} })

  const { searchParams } = req.nextUrl
  const goalIds = searchParams.get('goalIds')
  if (!goalIds) return NextResponse.json({ tasks: {} })

  const ids = goalIds.split(',').filter(Boolean)
  if (!ids.length) return NextResponse.json({ tasks: {} })

  const SELECT = [
    'id', 'goal_id', 'status', 'title', 'priority',
    'created_at', 'updated_at', 'claimed_at', 'claimed_by',
    'result', 'error', 'blocked_reason', 'attempt_count',
    'tags', 'context', 'jeff_notes', 'context_summary',
  ].join(',')

  try {
    const res = await fetch(
      `${url}/rest/v1/task_queue?select=${SELECT}&goal_id=in.(${ids.join(',')})&order=created_at.desc&limit=500`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: 'no-store',
      }
    )

    if (!res.ok) return NextResponse.json({ tasks: {} })

    type Row = {
      id: string
      goal_id: string
      status: string
      title: string
      priority: number
      created_at: string
      updated_at: string
      claimed_at: string | null
      claimed_by: string | null
      result: string | null
      error: string | null
      blocked_reason: string | null
      attempt_count: number
      tags: string[] | null
      context: Record<string, unknown> | null
      jeff_notes: string | null
      context_summary: string | null
    }
    const rows: Row[] = await res.json()

    const RUNNING_STATUSES = new Set(['in_progress_agent', 'claimed', 'in_progress_jeff'])
    const PARTIAL_STATUSES = new Set(['review_needed', 'pending_jeff_action', 'pending_eval'])

    type TaskItem = {
      id: string
      title: string
      status: string
      priority: number
      created_at: string
      updated_at: string
      claimed_at: string | null
      claimed_by: string | null
      attempt_count: number
      schedule: string | null               // context.recurring_schedule
      scheduled_for: string | null          // context.scheduled_for (date-driven queue)
      tags: string[]
      result_excerpt: string | null         // first 200 chars of result, plain text
      error: string | null
      blocked_reason: string | null
      jeff_notes: string | null
      context_summary: string | null
    }

    type Counts = { active: number; done: number; blocked: number; partial: number; total: number; pct_complete: number }

    type Entry = {
      goal_id: string
      // Legacy "latest" fields — drive existing TaskStatusBadge / progress bar
      id: string
      status: string
      updated_at: string
      claimed_by: string | null
      error: string | null
      counts: Counts
      // New rich fields
      latest: TaskItem | null
      items: TaskItem[]
    }

    const tasks: Record<string, Entry> = {}
    const itemsByGoal: Record<string, TaskItem[]> = {}
    const countsMap: Record<string, { active: number; done: number; blocked: number; partial: number }> = {}

    function toItem(row: Row): TaskItem {
      const ctx = row.context ?? {}
      const schedule = typeof ctx.recurring_schedule === 'string' ? ctx.recurring_schedule : null
      const scheduledFor = typeof ctx.scheduled_for === 'string' ? ctx.scheduled_for : null
      const excerpt = row.result ? row.result.replace(/\s+/g, ' ').slice(0, 200) : null
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        priority: row.priority,
        created_at: row.created_at,
        updated_at: row.updated_at,
        claimed_at: row.claimed_at,
        claimed_by: row.claimed_by,
        attempt_count: row.attempt_count,
        schedule,
        scheduled_for: scheduledFor,
        tags: row.tags ?? [],
        result_excerpt: excerpt,
        error: row.error,
        blocked_reason: row.blocked_reason,
        jeff_notes: row.jeff_notes,
        context_summary: row.context_summary,
      }
    }

    for (const row of rows) {
      // Most-recent task per goal (rows are desc by created_at)
      if (!tasks[row.goal_id]) {
        tasks[row.goal_id] = {
          goal_id: row.goal_id,
          id: row.id,
          status: row.status,
          updated_at: row.updated_at,
          claimed_by: row.claimed_by,
          error: row.error,
          counts: { active: 0, done: 0, blocked: 0, partial: 0, total: 0, pct_complete: 0 },
          latest: toItem(row),
          items: [],
        }
      }

      // Skip archived from progress counts AND from rich items list
      if (row.status === 'archived') continue

      if (!itemsByGoal[row.goal_id]) itemsByGoal[row.goal_id] = []
      if (itemsByGoal[row.goal_id].length < 5) itemsByGoal[row.goal_id].push(toItem(row))

      if (!countsMap[row.goal_id]) countsMap[row.goal_id] = { active: 0, done: 0, blocked: 0, partial: 0 }
      if (row.status === 'completed') {
        countsMap[row.goal_id].done++
      } else if (['blocked', 'failed', 'escalated'].includes(row.status)) {
        countsMap[row.goal_id].blocked++
      } else if (PARTIAL_STATUSES.has(row.status)) {
        countsMap[row.goal_id].partial++
      } else if (RUNNING_STATUSES.has(row.status)) {
        countsMap[row.goal_id].active++
      } else {
        countsMap[row.goal_id].active++
      }
    }

    for (const goalId of Object.keys(tasks)) {
      const c = countsMap[goalId] ?? { active: 0, done: 0, blocked: 0, partial: 0 }
      const total = c.active + c.done + c.blocked + c.partial
      const effectiveDone = c.done + c.partial * 0.5
      tasks[goalId].counts = {
        ...c,
        total,
        pct_complete: total > 0 ? Math.round((effectiveDone / total) * 100) : 0,
      }
      tasks[goalId].items = itemsByGoal[goalId] ?? []
    }

    return NextResponse.json({ tasks })
  } catch {
    return NextResponse.json({ tasks: {} })
  }
}
