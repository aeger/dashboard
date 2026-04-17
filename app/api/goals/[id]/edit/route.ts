import { NextRequest, NextResponse } from 'next/server'

const SUPA_HEADERS = (key: string) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
})

const ALLOWED_FIELDS = ['title', 'description', 'notes', 'priority', 'target_date', 'tags', 'progress', 'parent_id']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

  const { id } = await params
  const body = await req.json()

  const patch: Record<string, unknown> = {}
  for (const field of ALLOWED_FIELDS) {
    if (field in body) patch[field] = body[field]
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  // Always touch updated_at
  patch.updated_at = new Date().toISOString()

  const res = await fetch(`${url}/rest/v1/goals?id=eq.${id}`, {
    method: 'PATCH',
    headers: SUPA_HEADERS(key),
    body: JSON.stringify(patch),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: 'Failed to update goal', detail: err }, { status: 500 })
  }

  const updated = await res.json()

  return NextResponse.json({ ok: true, goal: Array.isArray(updated) ? updated[0] : updated })
}
