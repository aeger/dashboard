export interface HostMetrics {
  name: string
  instance: string
  cpu_percent: number | null
  ram_used_percent: number | null
  ram_total_gb: number | null
  ram_used_gb: number | null
  disk_used_percent: number | null
  disk_total_gb: number | null
  disk_used_gb: number | null
  net_rx_bytes: number | null
  net_tx_bytes: number | null
  uptime_days: number | null
  load_1m: number | null
}

export interface StoragePool {
  name: string          // e.g. nvme-fast
  id: string            // e.g. storage/az-lab/nvme-fast
  used_percent: number | null
  used_gb: number | null
  size_gb: number | null
}

// Proxmox storage capacity from prometheus-pve-exporter (pve_disk_*). Keyed by
// the `id` label (storage/<node>/<name>), not `instance`. Note: for ZFS pools
// this is the COMMITTED figure (includes refreservations), which is what PVE
// enforces for allocation — i.e. the number that actually matters for "full".
export async function fetchStoragePools(): Promise<StoragePool[]> {
  const baseUrl = process.env.PROMETHEUS_URL
  if (!baseUrl) return []

  const byId = async (query: string): Promise<Record<string, number>> => {
    try {
      const res = await fetch(`${baseUrl}/api/v1/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ query }),
        signal: AbortSignal.timeout(2500),
        next: { revalidate: 30 },
      })
      if (!res.ok) return {}
      const data = await res.json()
      const out: Record<string, number> = {}
      for (const item of data.data?.result ?? []) {
        const id = item.metric?.id
        if (id) out[id] = parseFloat(item.value?.[1] ?? '0')
      }
      return out
    } catch {
      return {}
    }
  }

  const [usage, size] = await Promise.all([
    byId(`pve_disk_usage_bytes{id=~"storage/.*"}`),
    byId(`pve_disk_size_bytes{id=~"storage/.*"}`),
  ])

  const toGB = (v: number | undefined) => (v != null ? Math.round((v / 1073741824) * 10) / 10 : null)
  const pools: StoragePool[] = []
  for (const id of Object.keys(size)) {
    const sz = size[id]
    if (!sz || sz <= 0) continue
    const used = usage[id] ?? 0
    pools.push({
      name: id.split('/').pop() || id,
      id,
      used_percent: Math.round((used / sz) * 1000) / 10,
      used_gb: toGB(used),
      size_gb: toGB(sz),
    })
  }
  pools.sort((a, b) => (b.used_percent ?? 0) - (a.used_percent ?? 0))
  return pools
}

export interface EndpointProbe {
  name: string                      // host derived from the probed URL
  url: string                       // full probed URL (prometheus `instance`)
  scope: 'public' | 'internal' | 'protected'
  success: boolean
  status_code: number | null
  duration_ms: number | null
  cert_expiry_days: number | null   // days until earliest TLS cert expiry, null if not TLS
}

// Blackbox-exporter endpoint probes (probe_* metrics). Joins probe_success,
// probe_http_status_code, probe_duration_seconds and probe_ssl_earliest_cert_expiry
// by the `instance` label (the probed URL). `job` names carry the scope
// (blackbox-http-{public,internal,protected}).
export async function fetchEndpointProbes(): Promise<EndpointProbe[]> {
  const baseUrl = process.env.PROMETHEUS_URL
  if (!baseUrl) return []

  const raw = async (query: string): Promise<Array<{ metric: Record<string, string>; value: [number, string] }>> => {
    try {
      const res = await fetch(`${baseUrl}/api/v1/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ query }),
        signal: AbortSignal.timeout(2500),
        next: { revalidate: 15 },
      })
      if (!res.ok) return []
      const data = await res.json()
      return data.data?.result ?? []
    } catch {
      return []
    }
  }

  const [success, status, duration, cert] = await Promise.all([
    raw('probe_success'),
    raw('probe_http_status_code'),
    raw('probe_duration_seconds'),
    raw('probe_ssl_earliest_cert_expiry'),
  ])

  const byInstance = (rows: Array<{ metric: Record<string, string>; value: [number, string] }>) => {
    const m: Record<string, number> = {}
    for (const r of rows) {
      const inst = r.metric?.instance
      if (inst) m[inst] = parseFloat(r.value?.[1] ?? 'NaN')
    }
    return m
  }

  const statusM = byInstance(status)
  const durM = byInstance(duration)
  const certM = byInstance(cert)
  const nowSec = Date.now() / 1000

  const scopeOf = (job: string): EndpointProbe['scope'] =>
    job.includes('public') ? 'public' : job.includes('protected') ? 'protected' : 'internal'
  const hostOf = (url: string) => {
    try {
      return new URL(url).host
    } catch {
      return url
    }
  }

  const probes: EndpointProbe[] = success.map((r) => {
    const url = r.metric?.instance ?? ''
    const certTs = certM[url]
    return {
      name: hostOf(url),
      url,
      scope: scopeOf(r.metric?.job ?? ''),
      success: parseFloat(r.value?.[1] ?? '0') === 1,
      status_code: Number.isFinite(statusM[url]) ? Math.round(statusM[url]) : null,
      duration_ms: Number.isFinite(durM[url]) ? Math.round(durM[url] * 1000) : null,
      cert_expiry_days:
        Number.isFinite(certTs) && certTs > 0 ? Math.round((certTs - nowSec) / 86400) : null,
    }
  })

  // Failing probes first, then by scope, then name — most actionable at top.
  probes.sort(
    (a, b) =>
      Number(a.success) - Number(b.success) ||
      a.scope.localeCompare(b.scope) ||
      a.name.localeCompare(b.name),
  )
  return probes
}

async function promQuery(baseUrl: string, query: string): Promise<Record<string, number>> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query }),
      signal: AbortSignal.timeout(2500),
      next: { revalidate: 30 },
    })

    if (!res.ok) return {}

    const data = await res.json()
    const result: Record<string, number> = {}

    for (const item of data.data?.result ?? []) {
      const instance = item.metric?.instance ?? 'unknown'
      result[instance] = parseFloat(item.value?.[1] ?? '0')
    }

    return result
  } catch {
    return {}
  }
}

export async function fetchHostMetrics(hosts: { name: string; node_exporter_instance: string }[]): Promise<HostMetrics[]> {
  const baseUrl = process.env.PROMETHEUS_URL
  if (!baseUrl) {
    return hosts.map((h) => ({
      name: h.name, instance: h.node_exporter_instance,
      cpu_percent: null, ram_used_percent: null, ram_total_gb: null, ram_used_gb: null,
      disk_used_percent: null, disk_total_gb: null, disk_used_gb: null,
      net_rx_bytes: null, net_tx_bytes: null, uptime_days: null, load_1m: null,
    }))
  }

  const [cpuData, ramData, ramTotalData, ramUsedData, diskData, diskTotalData, diskUsedData, netRxData, netTxData, uptimeData, loadData] = await Promise.all([
    promQuery(baseUrl, `100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`),
    promQuery(baseUrl, `100 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100)`),
    promQuery(baseUrl, `node_memory_MemTotal_bytes`),
    promQuery(baseUrl, `node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes`),
    promQuery(baseUrl, `100 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} * 100)`),
    promQuery(baseUrl, `node_filesystem_size_bytes{mountpoint="/"}`),
    promQuery(baseUrl, `node_filesystem_size_bytes{mountpoint="/"} - node_filesystem_avail_bytes{mountpoint="/"}`),
    promQuery(baseUrl, `irate(node_network_receive_bytes_total{device!="lo"}[5m])`),
    promQuery(baseUrl, `irate(node_network_transmit_bytes_total{device!="lo"}[5m])`),
    promQuery(baseUrl, `(time() - node_boot_time_seconds) / 86400`),
    promQuery(baseUrl, `node_load1`),
  ])

  const toGB = (v: number | undefined) => v != null ? Math.round(v / 1073741824 * 10) / 10 : null
  const round1 = (v: number | undefined) => v != null ? Math.round(v * 10) / 10 : null

  return hosts.map((h) => ({
    name: h.name,
    instance: h.node_exporter_instance,
    cpu_percent: round1(cpuData[h.node_exporter_instance]),
    ram_used_percent: round1(ramData[h.node_exporter_instance]),
    ram_total_gb: toGB(ramTotalData[h.node_exporter_instance]),
    ram_used_gb: toGB(ramUsedData[h.node_exporter_instance]),
    disk_used_percent: round1(diskData[h.node_exporter_instance]),
    disk_total_gb: toGB(diskTotalData[h.node_exporter_instance]),
    disk_used_gb: toGB(diskUsedData[h.node_exporter_instance]),
    net_rx_bytes: netRxData[h.node_exporter_instance] ?? null,
    net_tx_bytes: netTxData[h.node_exporter_instance] ?? null,
    uptime_days: round1(uptimeData[h.node_exporter_instance]),
    load_1m: round1(loadData[h.node_exporter_instance]),
  }))
}
