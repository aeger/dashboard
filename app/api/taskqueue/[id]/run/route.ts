import { NextRequest, NextResponse } from 'next/server'
import { sshExec } from '@/lib/ssh-exec'

const SUPA_HEADERS = (key: string) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
})

const RUNNABLE_STATUSES = new Set(['ready', 'pending', 'backlog'])

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

  const { id } = await params

  // Verify task exists and is in a runnable status
  const fetchRes = await fetch(
    `${url}/rest/v1/task_queue?id=eq.${id}&select=id,status`,
    { headers: SUPA_HEADERS(key), cache: 'no-store' }
  )
  if (!fetchRes.ok) return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 })

  const rows: Array<{ id: string; status: string }> = await fetchRes.json()
  if (!rows.length) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const { status } = rows[0]
  if (!RUNNABLE_STATUSES.has(status)) {
    return NextResponse.json(
      { error: `Task is not in a runnable status (current: ${status})` },
      { status: 400 }
    )
  }

  try {
    await sshExec('systemctl --user start --no-block claude-queue-poll.service', 15_000)
    return NextResponse.json({ ok: true, message: 'Poller triggered' })
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: 'Failed to trigger poller', detail },
      { status: 500 }
    )
  }
}
