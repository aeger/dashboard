import { NextResponse } from 'next/server'
import { fetchEndpointProbes } from '@/lib/prometheus'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const probes = await fetchEndpointProbes()
    return NextResponse.json({ probes })
  } catch {
    return NextResponse.json({ probes: [] })
  }
}
