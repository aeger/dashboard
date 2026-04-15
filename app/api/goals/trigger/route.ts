import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

  try {
    const body = await req.json()
    const { goalId, title, description } = body

    if (!goalId || !title) {
      return NextResponse.json({ error: 'Missing required fields: goalId, title' }, { status: 400 })
    }

    const payload = {
      title: `Goal: ${title}`,
      description: description || title,
      status: 'pending',
      source: 'dashboard',
      priority: 1,
      goal_id: goalId,
      tags: ['goal', `goal-id:${goalId}`],
    }

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
