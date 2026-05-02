import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// PATCH /api/scheduled-activity/<name>
// Body: { enabled?, paused_at?, pause_reason?, description? }
// Writes to scheduled_activity. The control daemon picks up the change on
// its next tick (~30s) and reconciles the native scheduler.

const ALLOWED_FIELDS = new Set(['enabled', 'paused_at', 'pause_reason', 'unpause_at', 'description', 'schedule'])

// Validate a desired schedule against the kind. Returns null on OK,
// or an error string explaining the rejection.
function validateSchedule(kind: string, schedule: string): string | null {
  const s = schedule.trim()
  if (!s) return 'Schedule cannot be empty'

  if (kind === 'agent_loop') {
    return 'Agent loops have a hardcoded poll interval — schedule is not editable from here. Change POLL_INTERVAL in the service unit and restart.'
  }
  if (kind === 'task_queue_recurring') {
    return 'task_queue recurring tasks are upstream-driven (the cowork CCR trigger does the upsert). Edit the trigger prompt on the cowork side instead.'
  }
  if (kind === 'systemd') {
    if (!(s.startsWith('oncalendar:') || s.startsWith('every:'))) {
      return 'systemd schedule must start with "oncalendar:" (then a systemd OnCalendar expression) or "every:" (then an OnUnitActiveSec value like "5min" / "30s" / "1h").'
    }
    return null
  }
  if (kind === 'cron') {
    const parts = s.split(/\s+/)
    if (parts.length !== 5) {
      return 'cron schedule must be exactly 5 whitespace-separated fields (minute hour day-of-month month day-of-week).'
    }
    return null
  }
  if (kind === 'ccr_trigger') {
    return 'CCR trigger schedule editing requires a claude.ai Personal Access Token — Phase 5.5 (not yet wired). Edit the trigger directly in the claude.ai dashboard for now.'
  }
  return `Unknown kind: ${kind}`
}

export async function PATCH(
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

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Whitelist
  const update: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k)) update[k] = v
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Schedule edits get extra validation per kind
  if (typeof update.schedule === 'string') {
    // We need the kind — fetch it cheaply
    const kindRes = await fetch(
      `${url}/rest/v1/scheduled_activity?name=eq.${encodeURIComponent(name)}&select=kind`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' },
    )
    const kindRows = await kindRes.json()
    if (!Array.isArray(kindRows) || kindRows.length === 0) {
      return NextResponse.json({ error: `No scheduled_activity "${name}"` }, { status: 404 })
    }
    const reason = validateSchedule(kindRows[0].kind, update.schedule)
    if (reason) {
      return NextResponse.json({ error: reason }, { status: 400 })
    }
  }

  // 1. Read current row for audit before-snapshot
  const beforeRes = await fetch(
    `${url}/rest/v1/scheduled_activity?name=eq.${encodeURIComponent(name)}&select=id,enabled,paused_at,pause_reason,description`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' },
  )
  if (!beforeRes.ok) {
    return NextResponse.json({ error: `Lookup failed: ${beforeRes.status}` }, { status: 502 })
  }
  const beforeRows: Array<{ id: string; enabled: boolean; paused_at: string | null; pause_reason: string | null; description: string | null }> = await beforeRes.json()
  if (beforeRows.length === 0) {
    return NextResponse.json({ error: `No scheduled_activity named "${name}"` }, { status: 404 })
  }
  const before = beforeRows[0]

  // 2. Apply update
  const patchRes = await fetch(
    `${url}/rest/v1/scheduled_activity?name=eq.${encodeURIComponent(name)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(update),
    },
  )
  if (!patchRes.ok) {
    const errText = await patchRes.text()
    return NextResponse.json({ error: `Update failed: ${errText.slice(0, 200)}` }, { status: 502 })
  }
  const after = (await patchRes.json())[0]

  // 3. Audit log — best-effort; don't fail the request on audit failure
  try {
    await fetch(`${url}/rest/v1/scheduled_activity_audit`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        scheduled_activity_id: before.id,
        scheduled_activity_name: name,
        action: 'updated',
        actor: 'jeff',  // dashboard write — assume Jeff for now (Phase 5: real user)
        before,
        after: update,
        notes: null,
      }),
    })
  } catch { /* swallow */ }

  return NextResponse.json({ activity: after })
}
