import { NextResponse } from 'next/server'

// Per-dataset ZFS space from the textfile collector on MS-01
// (/usr/local/bin/zfs-dataset-metrics.sh → node_exporter:9100 on 192.168.1.182,
// cron */5). The PVE exporter only reports pool-level committed space.
export const dynamic = 'force-dynamic'

export interface ZfsDataset {
  name: string
  pool: string
  dstype: string // filesystem | volume
  used_bytes: number
  available_bytes: number
  referenced_bytes: number
}

async function promQuery(baseUrl: string, query: string) {
  try {
    const res = await fetch(`${baseUrl}/api/v1/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query }),
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.data?.result ?? []) as Array<{ metric: Record<string, string>; value: [number, string] }>
  } catch {
    return []
  }
}

export async function GET() {
  const baseUrl = process.env.PROMETHEUS_URL
  if (!baseUrl) return NextResponse.json({ datasets: [] })

  const [used, avail, refer] = await Promise.all([
    promQuery(baseUrl, 'zfs_dataset_used_bytes'),
    promQuery(baseUrl, 'zfs_dataset_available_bytes'),
    promQuery(baseUrl, 'zfs_dataset_referenced_bytes'),
  ])

  const key = (m: Record<string, string>) => m.name ?? ''
  const availM = new Map(avail.map((r) => [key(r.metric), parseFloat(r.value[1])]))
  const referM = new Map(refer.map((r) => [key(r.metric), parseFloat(r.value[1])]))

  const datasets: ZfsDataset[] = used
    .map((r) => {
      const name = key(r.metric)
      return {
        name,
        pool: name.split('/')[0],
        dstype: r.metric.dstype ?? 'filesystem',
        used_bytes: parseFloat(r.value[1]),
        available_bytes: availM.get(name) ?? 0,
        referenced_bytes: referM.get(name) ?? 0,
      }
    })
    .filter((d) => d.name)
    .sort((a, b) => a.pool.localeCompare(b.pool) || b.used_bytes - a.used_bytes)

  return NextResponse.json({ datasets })
}
