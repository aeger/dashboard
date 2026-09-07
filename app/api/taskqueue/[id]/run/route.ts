import { NextRequest, NextResponse } from 'next/server'

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

  // This used to run `systemctl --user start claude-queue-poll.service`.
  //
  // That unit was retired and MASKED on 2026-09-07: it and argus.service both
  // claimed from the same queue and double-dispatched (task bd2eecfe went out
  // twice, 71s apart, one row per daemon). Starting a masked unit fails, so the
  // old call would now 500 on every click.
  //
  // It also made this endpoint a queue dispatcher in its own right -- an HTTP
  // route that could start a second claimer was almost certainly the unexplained
  // poller run at 09:19Z that survived two rounds of "the timer is retired".
  //
  // Argus polls every POLL_INTERVAL (60s) and claims anything in ready/pending,
  // so a runnable task needs no kick: confirm it is runnable and say when it will
  // be picked up. Nothing here starts a second dispatcher.
  return NextResponse.json({
    ok: true,
    message: 'Task is runnable — Argus will claim it within ~60s.',
  })
}
