import { NextResponse } from 'next/server'

export interface Goal {
  id: string
  parent_id: string | null
  title: string
  description: string | null
  level: 'vision' | 'strategy' | 'milestone' | 'objective'
  status: 'active' | 'completed' | 'paused' | 'planned' | 'blocked'
  priority: number
  target_date: string | null
  completed_at: string | null
  progress: number
  tags: string[] | null
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
  children?: Goal[]
}

const SELECT = 'id,parent_id,title,description,level,status,priority,target_date,completed_at,progress,tags,notes,sort_order,created_at,updated_at'

function buildTree(flat: Goal[]): Goal[] {
  const map = new Map<string, Goal>()
  flat.forEach((g) => { g.children = []; map.set(g.id, g) })
  const roots: Goal[] = []
  flat.forEach((g) => {
    if (g.parent_id && map.has(g.parent_id)) {
      map.get(g.parent_id)!.children!.push(g)
    } else {
      roots.push(g)
    }
  })
  // Sort each level by sort_order
  const sortChildren = (nodes: Goal[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order)
    nodes.forEach((n) => n.children && sortChildren(n.children))
  }
  sortChildren(roots)
  return roots
}

export async function GET() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

  try {
    const res = await fetch(
      `${url}/rest/v1/goals?select=${SELECT}&order=sort_order.asc`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: 'no-store',
      }
    )
    if (!res.ok) return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 })
    const flat: Goal[] = await res.json()
    return NextResponse.json({ goals: buildTree(flat), flat })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

  try {
    const body = await req.json()
    const { title, description, level, parent_id, status, priority, target_date, notes, tags } = body

    if (!title || !level || !status) {
      return NextResponse.json({ error: 'Missing required fields: title, level, status' }, { status: 400 })
    }

    const payload: Record<string, unknown> = {
      title,
      level,
      status,
      priority: priority ?? 2,
      sort_order: 100,
      progress: 0,
    }
    if (description) payload.description = description
    if (parent_id) payload.parent_id = parent_id
    if (target_date) payload.target_date = target_date
    if (notes) payload.notes = notes
    if (tags) payload.tags = tags

    const res = await fetch(`${url}/rest/v1/goals`, {
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
      return NextResponse.json({ error: 'Failed to create goal', detail: err }, { status: 500 })
    }

    const created = await res.json()
    return NextResponse.json({ goal: Array.isArray(created) ? created[0] : created }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 })
  }
}
