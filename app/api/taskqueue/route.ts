import { NextResponse } from 'next/server'

export interface TaskQueueStats {
  counts: { pending: number; in_progress: number; completed: number; failed: number }
  recent: Array<{
    id: string
    title: string
    status: string
    model: string | null
    created_at: string
    claimed_at: string | null
  }>
  total_24h: number
}

export async function GET() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
  const base = `${url}/rest/v1`

  try {
    // Fetch status counts
    const countRes = await fetch(
      `${base}/task_queue?select=status&order=status`,
      { headers, next: { revalidate: 30 } }
    )
    const allTasks: Array<{ status: string }> = countRes.ok ? await countRes.json() : []

    const counts = { pending: 0, in_progress: 0, completed: 0, failed: 0 }
    for (const t of allTasks) {
      const s = t.status as keyof typeof counts
      if (s in counts) counts[s]++
    }

    // Fetch recent tasks (last 8)
    const recentRes = await fetch(
      `${base}/task_queue?select=id,title,status,context,created_at,claimed_at&order=created_at.desc&limit=8`,
      { headers, next: { revalidate: 30 } }
    )
    const recentRaw: Array<{ id: string; title: string; status: string; context: Record<string, unknown> | null; created_at: string; claimed_at: string | null }> =
      recentRes.ok ? await recentRes.json() : []

    const recent = recentRaw.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      model: (t.context?.model as string) ?? null,
      created_at: t.created_at,
      claimed_at: t.claimed_at,
    }))

    // Count tasks from last 24h
    const since = new Date(Date.now() - 86400000).toISOString()
    const since24Res = await fetch(
      `${base}/task_queue?select=id&created_at=gte.${since}`,
      { headers, next: { revalidate: 30 } }
    )
    const total_24h = since24Res.ok ? ((await since24Res.json()) as unknown[]).length : 0

    return NextResponse.json({ counts, recent, total_24h })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch task queue' }, { status: 500 })
  }
}
