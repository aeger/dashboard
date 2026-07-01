import { NextResponse } from 'next/server'

// navidys/prometheus-podman-exporter `podman_container_state` enum:
// 0=created 1=initialized 2=running 3=stopped 4=paused 5=exited 6=removing 7=stopping
export const PODMAN_STATE_RUNNING = 2

export interface ContainerMetric {
  id: string
  name: string
  image: string
  state: number             // raw podman_container_state (see PODMAN_STATE_RUNNING)
  running: boolean          // derived — widgets should use this, not the raw enum
  cpu_pct: number | null
  mem_bytes: number | null
  mem_limit: number | null
  mem_pct: number | null
  net_rx: number | null
  net_tx: number | null
}

async function promQuery(query: string): Promise<{ metric: Record<string, string>; value: string }[]> {
  const baseUrl = process.env.PROMETHEUS_URL
  if (!baseUrl) return []
  try {
    const res = await fetch(`${baseUrl}/api/v1/query?query=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(2500),
      next: { revalidate: 15 },
    })
    const data = await res.json()
    return (data.data?.result ?? []).map((r: { metric: Record<string, string>; value: [number, string] }) => ({
      metric: r.metric,
      value: r.value[1],
    }))
  } catch {
    return []
  }
}

export async function GET() {
  const [infoRows, stateRows, cpuRows, memRows, memLimitRows, netRxRows, netTxRows] = await Promise.all([
    promQuery('podman_container_info'),
    promQuery('podman_container_state'),
    promQuery('irate(podman_container_cpu_seconds_total[2m]) * 100'),
    promQuery('podman_container_mem_usage_bytes'),
    promQuery('podman_container_mem_limit_bytes'),
    promQuery('irate(podman_container_net_input_total[2m])'),
    promQuery('irate(podman_container_net_output_total[2m])'),
  ])

  // Build name + image map from info
  const infoMap: Record<string, { name: string; image: string }> = {}
  for (const r of infoRows) {
    if (r.metric.id) infoMap[r.metric.id] = { name: r.metric.name ?? r.metric.id, image: r.metric.image ?? '' }
  }

  // Build per-metric maps keyed by id
  const byId = <T>(rows: { metric: Record<string, string>; value: string }[], fn: (v: string) => T) =>
    Object.fromEntries(rows.filter(r => r.metric.id).map(r => [r.metric.id, fn(r.value)]))

  const stateMap   = byId(stateRows,    v => parseInt(v))
  const cpuMap     = byId(cpuRows,      v => parseFloat(v))
  const memMap     = byId(memRows,      v => parseFloat(v))
  const memLimMap  = byId(memLimitRows, v => parseFloat(v))
  const netRxMap   = byId(netRxRows,    v => parseFloat(v))
  const netTxMap   = byId(netTxRows,    v => parseFloat(v))

  const containers: ContainerMetric[] = Object.entries(infoMap)
    .map(([id, { name, image }]) => {
      const mem  = memMap[id]  ?? null
      const lim  = memLimMap[id] ?? null
      const memPct = mem != null && lim != null && lim > 0 ? (mem / lim) * 100 : null
      const state = stateMap[id] ?? -1
      return {
        id,
        name,
        image,
        state,
        running: state === PODMAN_STATE_RUNNING,
        cpu_pct: cpuMap[id] != null ? Math.round(cpuMap[id] * 100) / 100 : null,
        mem_bytes: mem,
        mem_limit: lim,
        mem_pct: memPct != null ? Math.round(memPct * 10) / 10 : null,
        net_rx: netRxMap[id] ?? null,
        net_tx: netTxMap[id] ?? null,
      }
    })
    .sort((a, b) => {
      // Running first, then by memory desc
      if (a.running !== b.running) return Number(b.running) - Number(a.running)
      return (b.mem_bytes ?? 0) - (a.mem_bytes ?? 0)
    })

  return NextResponse.json({ containers })
}
