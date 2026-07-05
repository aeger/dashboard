import { NextResponse } from 'next/server'
import { fetchHostMetrics } from '@/lib/prometheus'
import { getConfig } from '@/lib/config'

// Live host metrics — must never be cached/prerendered (else it freezes at the
// first value and shows stale/empty data). Matches /api/storage, /api/probes.
export const dynamic = 'force-dynamic'

export async function GET() {
  const config = getConfig()
  try {
    const metrics = await fetchHostMetrics(config.lab.hosts)
    return NextResponse.json({ metrics })
  } catch {
    return NextResponse.json({ metrics: [] })
  }
}
