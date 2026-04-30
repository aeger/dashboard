import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export interface BackupStatus {
  name: string
  prefix: string
  cadence: 'daily' | 'weekly' | string
  expected_interval_hours: number
  last_status: 'success' | 'failed' | 'skipped' | string
  last_run_at: string | null
  last_completed_at: string | null
  last_duration_ms: number | null
  last_bytes: number | null
  last_object_key: string | null
  last_error: string | null
  host: string
  metadata: Record<string, unknown>
  last_success_at: string | null
  last_success_bytes: number | null
  last_success_key: string | null
  health: 'ok' | 'overdue' | 'failed' | 'never_succeeded' | string
  seconds_since_success: number | null
}

export async function GET() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY

  if (!url || !key) {
    return NextResponse.json({ backups: [], error: 'no_supabase_env' })
  }

  try {
    const res = await fetch(
      `${url}/rest/v1/backup_status_latest?select=*&order=name.asc`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        next: { revalidate: 0 },
      },
    )
    if (!res.ok) throw new Error(`Supabase ${res.status}`)
    const backups = (await res.json()) as BackupStatus[]
    return NextResponse.json({ backups })
  } catch (err) {
    return NextResponse.json({ backups: [], error: String(err) }, { status: 500 })
  }
}
