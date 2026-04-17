import { NextRequest, NextResponse } from 'next/server'
import { fetchContainers } from '@/lib/portainer'

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')
  const tail = req.nextUrl.searchParams.get('tail') ?? '200'
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

  const baseUrl = process.env.PORTAINER_URL
  const apiKey = process.env.PORTAINER_API_KEY
  if (!baseUrl || !apiKey) return NextResponse.json({ error: 'Portainer not configured' }, { status: 503 })

  const containers = await fetchContainers()
  const c = containers.find((ct) => ct.name === name)
  if (!c) return NextResponse.json({ error: `Container not found: ${name}` }, { status: 404 })

  try {
    const res = await fetch(
      `${baseUrl}/api/endpoints/${c.endpointId}/docker/containers/${c.id}/logs?stdout=1&stderr=1&tail=${tail}&timestamps=1`,
      { headers: { 'X-API-Key': apiKey }, cache: 'no-store' }
    )
    if (!res.ok) return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
    const raw = await res.text()
    // Strip Docker log multiplexing headers (8-byte binary prefix per line)
    const lines = raw.split('\n').map((line) => {
      if (line.length > 8 && line.charCodeAt(0) <= 2) return line.slice(8)
      return line
    }).join('\n')
    return NextResponse.json({ name, logs: lines })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
