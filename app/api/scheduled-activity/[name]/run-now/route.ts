import { NextRequest, NextResponse } from 'next/server'
import { sshExec } from '@/lib/ssh-exec'

export const dynamic = 'force-dynamic'

// POST /api/scheduled-activity/<name>/run-now
// One-shot trigger of a scheduled activity. Per-kind dispatch:
//   systemd:               systemctl --user start <unit-as-service-not-timer>
//   cron:                  /bin/bash -c "<line>" (subset support)
//   agent_loop:            n/a — these are always-running, no manual run
//   task_queue_recurring:  POST /api/taskqueue with manual_run_of context
//   ccr_trigger:           warn — needs claude.ai PAT (Phase 5)

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,80}$/

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const cookie = req.headers.get('cookie') || ''
  if (!cookie.includes('authelia_session')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name } = await params
  if (!NAME_RE.test(name)) {
    return NextResponse.json({ error: 'Invalid scheduled-activity name' }, { status: 400 })
  }

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  // Lookup
  const lookupRes = await fetch(
    `${url}/rest/v1/scheduled_activity?name=eq.${encodeURIComponent(name)}&select=id,kind,source_ref,display_name,description`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' },
  )
  const rows = await lookupRes.json()
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: `No scheduled_activity "${name}"` }, { status: 404 })
  }
  const row = rows[0] as {
    id: string
    kind: string
    source_ref: Record<string, unknown>
    display_name: string | null
    description: string | null
  }

  let result: { success: boolean; output?: string; error?: string }
  try {
    if (row.kind === 'systemd') {
      const unit = String(row.source_ref.unit || '')
      // <foo>.timer triggers <foo>.service — systemctl start <foo>.service runs it once
      const serviceUnit = unit.endsWith('.timer') ? unit.replace(/\.timer$/, '.service') : unit
      const out = await sshExec(`systemctl --user start ${serviceUnit}`, 30_000)
      result = { success: true, output: out || `started ${serviceUnit}` }
    } else if (row.kind === 'cron') {
      const line = String(row.source_ref.line || '')
      // Strip cron schedule fields — fragile, but cron lines start with 5 fields
      const parts = line.trim().split(/\s+/)
      if (parts.length < 6) throw new Error('Could not parse cron line')
      const cmd = parts.slice(5).join(' ')
      const out = await sshExec(`bash -c ${escapeShell(cmd)}`, 60_000)
      result = { success: true, output: out || `ran cron command` }
    } else if (row.kind === 'agent_loop') {
      const service = String(row.source_ref.service || '')
      // Agent loops are continuous — "run now" = restart the loop
      const out = await sshExec(`systemctl --user restart ${service}`, 30_000)
      result = { success: true, output: out || `restarted ${service}` }
    } else if (row.kind === 'task_queue_recurring') {
      const taskId = String(row.source_ref.task_id || '')
      // Clone the recurring task as a one-off ready task
      const taskRes = await fetch(
        `${url}/rest/v1/task_queue?id=eq.${taskId}&select=title,description,priority,target,tags,context`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } },
      )
      const tasks = await taskRes.json()
      if (!tasks[0]) throw new Error(`task_queue row ${taskId} not found`)
      const t = tasks[0]
      const cloneRes = await fetch(`${url}/rest/v1/task_queue`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          title: t.title,
          description: t.description,
          priority: t.priority,
          target: t.target,
          tags: [...(t.tags || []), 'manual-run'],
          status: 'ready',
          source: 'dashboard',
          context: { ...(t.context || {}), manual_run_of: taskId, ran_at: new Date().toISOString() },
        }),
      })
      const cloned = await cloneRes.json()
      result = { success: true, output: `queued one-off clone: ${cloned[0]?.id}` }
    } else if (row.kind === 'ccr_trigger') {
      result = { success: false, error: 'CCR trigger run-now needs claude.ai PAT — Phase 5' }
    } else {
      result = { success: false, error: `Unknown kind: ${row.kind}` }
    }
  } catch (e) {
    result = { success: false, error: e instanceof Error ? e.message : 'unknown error' }
  }

  // Audit
  try {
    await fetch(`${url}/rest/v1/scheduled_activity_audit`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        scheduled_activity_id: row.id,
        scheduled_activity_name: name,
        action: result.success ? 'manual_run' : 'manual_run_failed',
        actor: 'jeff',
        after: { kind: row.kind, output: result.output, error: result.error },
        notes: result.output || result.error || null,
      }),
    })
  } catch { /* swallow */ }

  return NextResponse.json(result, { status: result.success ? 200 : 500 })
}

function escapeShell(s: string): string {
  // Wrap in single quotes; escape any embedded single quotes.
  return `'${s.replace(/'/g, "'\\''")}'`
}
