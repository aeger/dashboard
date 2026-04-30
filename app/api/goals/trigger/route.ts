import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

  try {
    const body = await req.json()
    const { goalId, title, description, notes, blockedByIds } = body

    if (!goalId || !title) {
      return NextResponse.json({ error: 'Missing required fields: goalId, title' }, { status: 400 })
    }

    const deps: string[] = Array.isArray(blockedByIds)
      ? blockedByIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      : []

    // Parse notes into individual items for agent context
    let noteItems: string[] = []
    if (notes) {
      try {
        const parsed = JSON.parse(notes)
        if (Array.isArray(parsed)) noteItems = parsed.filter(Boolean)
      } catch {}
      if (!noteItems.length) noteItems = [notes]
    }

    const context: Record<string, unknown> = {}
    if (noteItems.length) context.notes = noteItems

    const payload: Record<string, unknown> = {
      title: `Goal: ${title}`,
      description: description || title,
      status: 'pending',
      source: 'dashboard',
      priority: 1,
      goal_id: goalId,
      tags: ['goal', `goal-id:${goalId}`],
    }
    if (Object.keys(context).length) payload.context = context
    if (deps.length) payload.blocked_by_task_ids = deps

    const res = await fetch(`${url}/rest/v1/task_queue`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: 'Failed to create task', detail: err }, { status: 500 })
    }

    const created = await res.json()
    const task = Array.isArray(created) ? created[0] : created
    return NextResponse.json({ taskId: task.id }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to trigger goal' }, { status: 500 })
  }
}
