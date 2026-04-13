import { NextRequest, NextResponse } from 'next/server'

// Returns the most recent task per goal_id for the given goal IDs
// GET /api/goals/tasks?goalIds=uuid1,uuid2,...
export async function GET(req: NextRequest) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ tasks: {} })

  const { searchParams } = req.nextUrl
  const goalIds = searchParams.get('goalIds')
  if (!goalIds) return NextResponse.json({ tasks: {} })

  const ids = goalIds.split(',').filter(Boolean)
  if (!ids.length) return NextResponse.json({ tasks: {} })

  try {
    // Fetch all tasks for these goal_ids, ordered newest first
    const filter = ids.map((id) => `goal_id.eq.${id}`).join(',')
    const res = await fetch(
      `${url}/rest/v1/task_queue?select=id,goal_id,status,title,created_at,updated_at,claimed_by,result,error&goal_id=in.(${ids.join(',')})&order=created_at.desc&limit=100`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: 'no-store',
      }
    )

    if (!res.ok) return NextResponse.json({ tasks: {} })

    const rows: {
      id: string
      goal_id: string
      status: string
      title: string
      created_at: string
      updated_at: string
      claimed_by: string | null
      result: string | null
      error: string | null
    }[] = await res.json()

    // Keep only the most recent task per goal
    const tasks: Record<string, typeof rows[0]> = {}
    for (const row of rows) {
      if (!tasks[row.goal_id]) tasks[row.goal_id] = row
    }

    return NextResponse.json({ tasks })
  } catch {
    return NextResponse.json({ tasks: {} })
  }
}
