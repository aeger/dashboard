import { NextRequest, NextResponse } from 'next/server'
import type { TaskItem } from '@/app/api/taskqueue/route'

// Notes/summary autosave. This deliberately NEVER writes status: the old path
// routed autosaves through /status with the status the open pane last rendered,
// so a debounced save could write a stale status back over a row an agent had
// since moved (the 2026-08-28 f465c0d7 re-flip, and the "unattributed writer"
// the 08-29 research task was hunting).

const SUPA_HEADERS = (key: string) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

  const { id } = await params

  let body: { jeff_notes?: string; context_summary?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (body.jeff_notes === undefined && body.context_summary === undefined) {
    return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })
  }

  const fetchRes = await fetch(
    `${url}/rest/v1/task_queue?id=eq.${id}&select=id,context`,
    { headers: SUPA_HEADERS(key), cache: 'no-store' }
  )
  if (!fetchRes.ok) return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 })
  const rows: TaskItem[] = await fetchRes.json()
  if (!rows.length) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const context = { ...((rows[0].context ?? {}) as Record<string, unknown>) }
  if (body.jeff_notes !== undefined) context.jeff_notes = body.jeff_notes
  if (body.context_summary !== undefined) context.context_summary = body.context_summary

  const patchRes = await fetch(`${url}/rest/v1/task_queue?id=eq.${id}`, {
    method: 'PATCH',
    headers: SUPA_HEADERS(key),
    body: JSON.stringify({ context }),
  })
  if (!patchRes.ok) {
    const err = await patchRes.text()
    return NextResponse.json({ error: 'Failed to save notes', detail: err }, { status: 500 })
  }
  const updated: TaskItem[] = await patchRes.json()
  return NextResponse.json({ ok: true, task: updated[0] ?? null })
}
