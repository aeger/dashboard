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
