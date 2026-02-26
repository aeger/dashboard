export interface HostMetrics {
  name: string
  instance: string
  cpu_percent: number | null
  ram_used_percent: number | null
  disk_used_percent: number | null
  net_rx_bytes: number | null
  net_tx_bytes: number | null
}

async function promQuery(baseUrl: string, query: string): Promise<Record<string, number>> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query }),
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
    return hosts.map((h) => ({ name: h.name, instance: h.node_exporter_instance, cpu_percent: null, ram_used_percent: null, disk_used_percent: null, net_rx_bytes: null, net_tx_bytes: null }))
  }

  const [cpuData, ramData, diskData, netRxData, netTxData] = await Promise.all([
    promQuery(baseUrl, `100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`),
    promQuery(baseUrl, `100 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100)`),
    promQuery(baseUrl, `100 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} * 100)`),
    promQuery(baseUrl, `irate(node_network_receive_bytes_total{device!="lo"}[5m])`),
    promQuery(baseUrl, `irate(node_network_transmit_bytes_total{device!="lo"}[5m])`),
  ])

  return hosts.map((h) => ({
    name: h.name,
    instance: h.node_exporter_instance,
    cpu_percent: cpuData[h.node_exporter_instance] != null ? Math.round(cpuData[h.node_exporter_instance] * 10) / 10 : null,
    ram_used_percent: ramData[h.node_exporter_instance] != null ? Math.round(ramData[h.node_exporter_instance] * 10) / 10 : null,
    disk_used_percent: diskData[h.node_exporter_instance] != null ? Math.round(diskData[h.node_exporter_instance] * 10) / 10 : null,
    net_rx_bytes: netRxData[h.node_exporter_instance] ?? null,
    net_tx_bytes: netTxData[h.node_exporter_instance] ?? null,
  }))
}
