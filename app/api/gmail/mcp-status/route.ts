import { NextResponse } from 'next/server'

export async function GET() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY

  if (!url || !key) return NextResponse.json({ auth_expired: false })

  try {
    const res = await fetch(
      `${url}/rest/v1/agent_heartbeat?agent=eq.gmail_mcp&select=status,last_heartbeat`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        next: { revalidate: 0 },
      }
    )
    if (!res.ok) return NextResponse.json({ auth_expired: false })

    const rows = (await res.json()) as Array<{ status: string; last_heartbeat: string }>
    const row = rows[0]
    if (!row) return NextResponse.json({ auth_expired: false })

    return NextResponse.json({ auth_expired: row.status === 'auth_expired' })
  } catch {
    return NextResponse.json({ auth_expired: false })
  }
}
