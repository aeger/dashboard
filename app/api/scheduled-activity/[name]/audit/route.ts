import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/scheduled-activity/<name>/audit
// Returns the last 50 audit entries for this scheduled_activity, newest-first.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const cookie = req.headers.get('cookie') || ''
  if (!cookie.includes('authelia_session')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name } = await params
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const res = await fetch(
    `${url}/rest/v1/scheduled_activity_audit?scheduled_activity_name=eq.${encodeURIComponent(name)}&order=created_at.desc&limit=50`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' },
  )
  if (!res.ok) {
    return NextResponse.json({ error: `Upstream ${res.status}` }, { status: 502 })
  }
  const entries = await res.json()
  return NextResponse.json({ entries })
}
