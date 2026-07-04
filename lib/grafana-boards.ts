/**
 * Grafana-parity board definitions — server-side only.
 *
 * Each board mirrors one provisioned Grafana dashboard
 * (~/azlab/services/monitoring/grafana/provisioning/dashboards/) panel-for-panel:
 * same PromQL, same units, same grouping. Executed by /api/grafana/[board] and
 * rendered by components/lab/GrafanaBoard.tsx. Rate interval is fixed at 5m
 * (the dashboards' default $interval).
 */

export type Unit =
  | 'reqps'
  | 'percent'
  | 'seconds'
  | 'bytes'
  | 'Bps'
  | 'bps'
  | 'pps'
  | 'short'
  | 'days'
  | 'bool'
  | 'duration'
  | 'cores'

/** Threshold direction: 'up' = higher is worse (default), 'down' = lower is worse. */
export interface Tone {
  warn?: number
  crit?: number
  dir?: 'up' | 'down'
}

export interface StatSpec {
  title: string
  expr: string
  unit: Unit
  decimals?: number
  tone?: Tone
}

export interface SeriesSpec {
  expr: string
  /** Legend template — {{label}} placeholders resolve from series labels. */
  legend: string
  /** Fixed series color (e.g. status-code panels); default categorical palette. */
  color?: string
}

export interface TimeSeriesSpec {
  kind: 'timeseries'
  title: string
  unit: Unit
  series: SeriesSpec[]
  stack?: boolean
  /** Full-width panel (default half at md+). */
  wide?: boolean
}

export interface BarGaugeSpec {
  kind: 'bargauge'
  title: string
  unit: Unit
  expr: string
  legend: string
  tone?: Tone
}

export interface TableColumnSpec {
  title: string
  expr: string
  unit: Unit
  tone?: Tone
}

export interface TableSpec {
  kind: 'table'
  title: string
  /** Labels forming the row identity across column queries. */
  joinLabels: string[]
  /** Row display name template (resolved from the FIRST column's labels). */
  nameLegend: string
  columns: TableColumnSpec[]
}

export type PanelSpec = TimeSeriesSpec | BarGaugeSpec | TableSpec

export interface BoardSpec {
  title: string
  /** Range window for timeseries panels, in seconds. */
  range: number
  /** query_range step in seconds. */
  step: number
  stats: StatSpec[]
  panels: PanelSpec[]
  /** Applied to resolved legends/row names (e.g. SNMP instance IP → device name). */
  relabel?: Record<string, string>
}

// ── Traefik — Gateway Metrics ────────────────────────────────────────────────

const T = `job="traefik"`
const entrypointDurBucket = `traefik_entrypoint_request_duration_seconds_bucket{${T}}`
const hq = (q: number) =>
  `histogram_quantile(${q}, sum(rate(${entrypointDurBucket}[5m])) by (le))`

const traefik: BoardSpec = {
  title: 'Traefik — Gateway Metrics',
  range: 3 * 3600,
  step: 60,
  stats: [
    { title: 'Request Rate', expr: `sum(rate(traefik_entrypoint_requests_total{${T}}[5m]))`, unit: 'reqps' },
    {
      title: 'Error Rate',
      expr: `100 * sum(rate(traefik_entrypoint_requests_total{${T},code=~"[45]..",code!="499"}[5m])) / clamp_min(sum(rate(traefik_entrypoint_requests_total{${T}}[5m])), 0.001)`,
      unit: 'percent',
      tone: { warn: 5, crit: 25 },
    },
    { title: 'p95 Latency', expr: hq(0.95), unit: 'seconds', tone: { warn: 0.5, crit: 2 } },
    { title: 'p99 Latency', expr: hq(0.99), unit: 'seconds', tone: { warn: 1, crit: 3 } },
    // Traefik v3 renamed open-connections and dropped service_server_up/retries.
    { title: 'Open Connections', expr: `sum(traefik_open_connections{${T}})`, unit: 'short' },
    { title: 'Services', expr: `count(count by (service) (traefik_service_requests_total{${T}}))`, unit: 'short' },
  ],
  panels: [
    {
      kind: 'timeseries',
      title: 'Request Rate by Entrypoint',
      unit: 'reqps',
      series: [
        { expr: `sum by (entrypoint) (rate(traefik_entrypoint_requests_total{${T}}[5m]))`, legend: '{{entrypoint}}' },
      ],
    },
    {
      kind: 'timeseries',
      title: 'HTTP Status Codes',
      unit: 'reqps',
      series: [
        { expr: `sum(rate(traefik_entrypoint_requests_total{${T},code=~"2.."}[5m]))`, legend: '2xx', color: '#059669' },
        { expr: `sum(rate(traefik_entrypoint_requests_total{${T},code=~"3.."}[5m]))`, legend: '3xx', color: '#0ea5e9' },
        { expr: `sum(rate(traefik_entrypoint_requests_total{${T},code=~"4..",code!="499"}[5m]))`, legend: '4xx', color: '#d97706' },
        { expr: `sum(rate(traefik_entrypoint_requests_total{${T},code=~"5.."}[5m]))`, legend: '5xx', color: '#dc2626' },
      ],
    },
    {
      kind: 'timeseries',
      title: 'Latency Percentiles (All Entrypoints)',
      unit: 'seconds',
      series: [
        { expr: hq(0.5), legend: 'p50', color: '#059669' },
        { expr: hq(0.9), legend: 'p90', color: '#0ea5e9' },
        { expr: hq(0.95), legend: 'p95', color: '#d97706' },
        { expr: hq(0.99), legend: 'p99', color: '#dc2626' },
      ],
    },
    {
      kind: 'timeseries',
      title: 'Open Connections by Entrypoint',
      unit: 'short',
      stack: true,
      series: [
        { expr: `sum by (entrypoint) (traefik_open_connections{${T}})`, legend: '{{entrypoint}}' },
      ],
    },
    {
      kind: 'bargauge',
      title: 'Top Services by Request Rate',
      unit: 'reqps',
      expr: `topk(10, sum by (service) (rate(traefik_service_requests_total{${T}}[5m])))`,
      legend: '{{service}}',
    },
    {
      kind: 'bargauge',
      title: 'Top Services by p95 Latency',
      unit: 'seconds',
      expr: `topk(10, histogram_quantile(0.95, sum by (service, le) (rate(traefik_service_request_duration_seconds_bucket{${T}}[5m]))))`,
      legend: '{{service}}',
      tone: { warn: 0.5, crit: 2 },
    },
    {
      kind: 'bargauge',
      title: 'Top Services by Error Rate',
      unit: 'reqps',
      expr: `topk(10, sum by (service) (rate(traefik_service_requests_total{${T},code=~"[45]..",code!="499"}[5m])))`,
      legend: '{{service}}',
      tone: { warn: 0.01, crit: 0.1 },
    },
    {
      kind: 'timeseries',
      title: 'TLS Requests by Version',
      unit: 'reqps',
      series: [
        { expr: `sum by (tls_version) (rate(traefik_entrypoint_requests_tls_total{${T}}[5m]))`, legend: 'TLS {{tls_version}}' },
      ],
    },
    {
      kind: 'timeseries',
      title: 'Bandwidth by Entrypoint',
      unit: 'Bps',
      series: [
        { expr: `sum by (entrypoint) (rate(traefik_entrypoint_requests_bytes_total{${T}}[5m]))`, legend: 'in {{entrypoint}}' },
        { expr: `sum by (entrypoint) (rate(traefik_entrypoint_responses_bytes_total{${T}}[5m]))`, legend: 'out {{entrypoint}}' },
      ],
    },
    {
      kind: 'timeseries',
      title: 'Config Reloads',
      unit: 'short',
      series: [
        { expr: `increase(traefik_config_reloads_total{${T}}[5m])`, legend: 'reloads', color: '#059669' },
      ],
    },
    {
      kind: 'table',
      title: 'TLS Certificates (Days Remaining)',
      joinLabels: ['sans', 'serial'],
      nameLegend: '{{sans}}',
      columns: [
        {
          title: 'Days left',
          expr: `(traefik_tls_certs_not_after{${T}} - time()) / 86400`,
          unit: 'days',
          tone: { warn: 30, crit: 14, dir: 'down' },
        },
      ],
    },
  ],
}

// ── Blackbox — Uptime & SSL ─────────────────────────────────────────────────

const B = `job=~"blackbox.*"`

const blackbox: BoardSpec = {
  title: 'Blackbox — Uptime & SSL',
  range: 24 * 3600,
  step: 300,
  stats: [
    { title: 'Availability 24h', expr: `avg(avg_over_time(probe_success{${B}}[24h])) * 100`, unit: 'percent', tone: { warn: 99, crit: 95, dir: 'down' } },
    { title: 'Probes Up', expr: `count(probe_success{${B}} == 1)`, unit: 'short' },
    { title: 'Probes Down', expr: `count(probe_success{${B}} == 0) or vector(0)`, unit: 'short', tone: { warn: 1, crit: 2 } },
    { title: 'Avg Latency', expr: `avg(probe_duration_seconds{${B}})`, unit: 'seconds', tone: { warn: 1, crit: 3 } },
    { title: 'Certs < 30d', expr: `count((probe_ssl_earliest_cert_expiry{${B}} - time()) < 86400 * 30) or vector(0)`, unit: 'short', tone: { warn: 1, crit: 2 } },
    { title: 'Min Cert Days', expr: `min((probe_ssl_earliest_cert_expiry{${B}} - time()) / 86400)`, unit: 'days', tone: { warn: 30, crit: 14, dir: 'down' } },
  ],
  panels: [
    {
      kind: 'timeseries',
      title: 'Probe Success (24h)',
      unit: 'bool',
      series: [{ expr: `probe_success{${B}}`, legend: '{{instance}}' }],
    },
    {
      kind: 'timeseries',
      title: 'Probe Duration',
      unit: 'seconds',
      series: [{ expr: `probe_duration_seconds{${B}}`, legend: '{{instance}}' }],
    },
    {
      kind: 'timeseries',
      title: 'SSL Certificate Expiry (Days Remaining)',
      unit: 'days',
      series: [{ expr: `(probe_ssl_earliest_cert_expiry{${B}} - time()) / 86400`, legend: '{{instance}}' }],
    },
    {
      kind: 'timeseries',
      title: 'HTTP Probe Phase Timings',
      unit: 'seconds',
      series: [
        { expr: `avg(probe_dns_lookup_time_seconds{${B}})`, legend: 'DNS lookup' },
        { expr: `avg(probe_tls_handshake_duration_seconds{${B}})`, legend: 'TLS handshake' },
        { expr: `avg(probe_http_duration_seconds{phase="connect",${B}})`, legend: 'TCP connect' },
        { expr: `avg(probe_http_duration_seconds{phase="processing",${B}})`, legend: 'processing' },
        { expr: `avg(probe_http_duration_seconds{phase="transfer",${B}})`, legend: 'transfer' },
      ],
    },
    {
      kind: 'table',
      title: 'Probe Status & Certificates',
      joinLabels: ['instance'],
      nameLegend: '{{instance}}',
      columns: [
        { title: 'Status', expr: `probe_success{${B}}`, unit: 'bool' },
        { title: 'Latency', expr: `probe_duration_seconds{${B}}`, unit: 'seconds', tone: { warn: 1, crit: 3 } },
        { title: 'Cert days', expr: `(probe_ssl_earliest_cert_expiry{${B}} - time()) / 86400`, unit: 'days', tone: { warn: 30, crit: 14, dir: 'down' } },
      ],
    },
  ],
}

// ── Host Overview — Node Exporter ───────────────────────────────────────────

const FS = `{mountpoint="/",fstype!="tmpfs"}`

const host: BoardSpec = {
  title: 'Host Overview — Node Exporter',
  range: 3 * 3600,
  step: 60,
  stats: [
    { title: 'CPU Usage', expr: `100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`, unit: 'percent', tone: { warn: 70, crit: 85 } },
    {
      title: 'RAM Usage',
      expr: `(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100`,
      unit: 'percent',
      tone: { warn: 70, crit: 85 },
    },
    { title: 'RAM Used', expr: `node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes`, unit: 'bytes' },
    { title: 'Load 1m', expr: `node_load1`, unit: 'short', decimals: 2, tone: { warn: 2, crit: 4 } },
    { title: 'Uptime', expr: `node_time_seconds - node_boot_time_seconds`, unit: 'duration' },
    {
      title: 'Root Disk',
      expr: `(node_filesystem_size_bytes${FS} - node_filesystem_free_bytes${FS}) / node_filesystem_size_bytes${FS} * 100`,
      unit: 'percent',
      tone: { warn: 70, crit: 85 },
    },
  ],
  panels: [
    {
      kind: 'timeseries',
      title: 'CPU Usage by Mode',
      unit: 'percent',
      stack: true,
      series: [{ expr: `avg by (mode) (rate(node_cpu_seconds_total{mode!="idle"}[5m])) * 100`, legend: '{{mode}}' }],
    },
    {
      kind: 'timeseries',
      title: 'Load Average',
      unit: 'short',
      series: [
        { expr: `node_load1`, legend: '1m', color: '#8b5cf6' },
        { expr: `node_load5`, legend: '5m', color: '#0ea5e9' },
        { expr: `node_load15`, legend: '15m', color: '#059669' },
      ],
    },
    {
      kind: 'timeseries',
      title: 'Memory Breakdown',
      unit: 'bytes',
      series: [
        { expr: `node_memory_MemTotal_bytes`, legend: 'total', color: '#71717a' },
        { expr: `node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes`, legend: 'used', color: '#d97706' },
        { expr: `node_memory_MemAvailable_bytes`, legend: 'available', color: '#059669' },
        { expr: `node_memory_Buffers_bytes + node_memory_Cached_bytes`, legend: 'buffers+cache', color: '#0ea5e9' },
      ],
    },
    {
      kind: 'timeseries',
      title: 'Swap Usage',
      unit: 'bytes',
      series: [
        { expr: `node_memory_SwapTotal_bytes`, legend: 'total', color: '#71717a' },
        { expr: `node_memory_SwapTotal_bytes - node_memory_SwapFree_bytes`, legend: 'used', color: '#d97706' },
      ],
    },
    {
      kind: 'timeseries',
      title: 'Network Traffic',
      unit: 'Bps',
      series: [
        { expr: `rate(node_network_receive_bytes_total{device!~"lo|veth.*|br.*|docker.*|virbr.*|podman.*"}[5m])`, legend: 'rx {{device}}' },
        { expr: `rate(node_network_transmit_bytes_total{device!~"lo|veth.*|br.*|docker.*|virbr.*|podman.*"}[5m])`, legend: 'tx {{device}}' },
      ],
    },
    {
      kind: 'timeseries',
      title: 'Network Errors & Drops',
      unit: 'pps',
      series: [
        { expr: `rate(node_network_receive_errs_total{device!~"lo"}[5m])`, legend: 'rx_err {{device}}' },
        { expr: `rate(node_network_transmit_errs_total{device!~"lo"}[5m])`, legend: 'tx_err {{device}}' },
        { expr: `rate(node_network_receive_drop_total{device!~"lo"}[5m])`, legend: 'rx_drop {{device}}' },
      ],
    },
    {
      kind: 'timeseries',
      title: 'Disk I/O Throughput',
      unit: 'Bps',
      series: [
        { expr: `rate(node_disk_read_bytes_total{device!~"loop.*"}[5m])`, legend: 'read {{device}}' },
        { expr: `rate(node_disk_written_bytes_total{device!~"loop.*"}[5m])`, legend: 'write {{device}}' },
      ],
    },
    {
      kind: 'timeseries',
      title: 'Disk I/O Utilization',
      unit: 'percent',
      series: [{ expr: `rate(node_disk_io_time_seconds_total{device!~"loop.*"}[5m]) * 100`, legend: '{{device}}' }],
    },
    {
      kind: 'table',
      title: 'Filesystem Usage',
      joinLabels: ['mountpoint'],
      nameLegend: '{{mountpoint}}',
      columns: [
        { title: 'Size', expr: `node_filesystem_size_bytes{fstype!~"tmpfs|squashfs|overlay"}`, unit: 'bytes' },
        {
          title: 'Used',
          expr: `node_filesystem_size_bytes{fstype!~"tmpfs|squashfs|overlay"} - node_filesystem_free_bytes{fstype!~"tmpfs|squashfs|overlay"}`,
          unit: 'bytes',
        },
        { title: 'Avail', expr: `node_filesystem_avail_bytes{fstype!~"tmpfs|squashfs|overlay"}`, unit: 'bytes' },
        {
          title: 'Used %',
          expr: `(node_filesystem_size_bytes{fstype!~"tmpfs|squashfs|overlay"} - node_filesystem_free_bytes{fstype!~"tmpfs|squashfs|overlay"}) / node_filesystem_size_bytes{fstype!~"tmpfs|squashfs|overlay"} * 100`,
          unit: 'percent',
          tone: { warn: 70, crit: 90 },
        },
      ],
    },
  ],
}

// ── Container Overview — cAdvisor + Podman ──────────────────────────────────

const C = `name!=""`

const containers: BoardSpec = {
  title: 'Container Overview — cAdvisor + Podman',
  range: 3 * 3600,
  step: 60,
  stats: [
    { title: 'Running', expr: `count(container_last_seen{${C}} > time() - 60)`, unit: 'short' },
    { title: 'Total CPU', expr: `sum(rate(container_cpu_usage_seconds_total{${C}}[5m]))`, unit: 'cores', decimals: 2 },
    { title: 'Total Memory', expr: `sum(container_memory_usage_bytes{${C}})`, unit: 'bytes' },
    { title: 'Net RX', expr: `sum(rate(container_network_receive_bytes_total{${C}}[5m]))`, unit: 'Bps' },
    { title: 'Net TX', expr: `sum(rate(container_network_transmit_bytes_total{${C}}[5m]))`, unit: 'Bps' },
    { title: 'Block Read', expr: `sum(rate(container_blkio_device_usage_total{${C},op="Read"}[5m]))`, unit: 'Bps' },
  ],
  panels: [
    {
      kind: 'timeseries',
      title: 'CPU Usage per Container',
      unit: 'cores',
      series: [{ expr: `rate(container_cpu_usage_seconds_total{${C}}[5m])`, legend: '{{name}}' }],
    },
    {
      kind: 'timeseries',
      title: 'Memory Usage per Container',
      unit: 'bytes',
      series: [{ expr: `container_memory_usage_bytes{${C}}`, legend: '{{name}}' }],
    },
    {
      kind: 'bargauge',
      title: 'Top Containers by Memory',
      unit: 'bytes',
      expr: `topk(10, container_memory_usage_bytes{${C}})`,
      legend: '{{name}}',
    },
    {
      kind: 'timeseries',
      title: 'Network Receive per Container',
      unit: 'Bps',
      series: [{ expr: `rate(container_network_receive_bytes_total{${C}}[5m])`, legend: '{{name}}' }],
    },
    {
      kind: 'timeseries',
      title: 'Network Transmit per Container',
      unit: 'Bps',
      series: [{ expr: `rate(container_network_transmit_bytes_total{${C}}[5m])`, legend: '{{name}}' }],
    },
    {
      kind: 'timeseries',
      title: 'Block I/O per Container',
      unit: 'Bps',
      series: [
        { expr: `rate(container_blkio_device_usage_total{${C},op="Read"}[5m])`, legend: 'read {{name}}' },
        { expr: `rate(container_blkio_device_usage_total{${C},op="Write"}[5m])`, legend: 'write {{name}}' },
      ],
    },
  ],
}

// ── MikroTik Network — RB5009 + CRS309 SNMP ─────────────────────────────────

const S = `job="snmp"`

const mikrotik: BoardSpec = {
  title: 'MikroTik Network — SNMP',
  range: 3 * 3600,
  step: 60,
  relabel: {
    '192.168.1.1': 'rb5009',
    '192.168.99.248': 'crs309',
  },
  stats: [
    { title: 'Devices Up', expr: `count(sysUpTime{${S}})`, unit: 'short' },
    { title: 'Active Ports', expr: `count(ifOperStatus{${S}} == 1)`, unit: 'short' },
    { title: 'Total RX', expr: `sum(rate(ifHCInOctets{${S}}[5m]))`, unit: 'Bps' },
    { title: 'Total TX', expr: `sum(rate(ifHCOutOctets{${S}}[5m]))`, unit: 'Bps' },
    { title: 'RX Errors', expr: `sum(rate(ifInErrors{${S}}[5m]))`, unit: 'pps', tone: { warn: 0.01, crit: 1 } },
    { title: 'TX Errors', expr: `sum(rate(ifOutErrors{${S}}[5m]))`, unit: 'pps', tone: { warn: 0.01, crit: 1 } },
  ],
  panels: [
    {
      kind: 'timeseries',
      title: 'Interface RX Throughput',
      unit: 'Bps',
      series: [{ expr: `rate(ifHCInOctets{${S}}[5m]) > 0`, legend: '{{ifDescr}} · {{instance}}' }],
    },
    {
      kind: 'timeseries',
      title: 'Interface TX Throughput',
      unit: 'Bps',
      series: [{ expr: `rate(ifHCOutOctets{${S}}[5m]) > 0`, legend: '{{ifDescr}} · {{instance}}' }],
    },
    {
      kind: 'timeseries',
      title: 'Interface Errors',
      unit: 'pps',
      series: [
        { expr: `rate(ifInErrors{${S}}[5m]) > 0`, legend: 'rx_err {{ifDescr}} · {{instance}}' },
        { expr: `rate(ifOutErrors{${S}}[5m]) > 0`, legend: 'tx_err {{ifDescr}} · {{instance}}' },
      ],
    },
    {
      kind: 'timeseries',
      title: 'Interface Discards',
      unit: 'pps',
      series: [
        { expr: `rate(ifInDiscards{${S}}[5m]) > 0`, legend: 'rx_drop {{ifDescr}} · {{instance}}' },
        { expr: `rate(ifOutDiscards{${S}}[5m]) > 0`, legend: 'tx_drop {{ifDescr}} · {{instance}}' },
      ],
    },
    {
      kind: 'table',
      title: 'Interface Status & Speed',
      joinLabels: ['instance', 'ifDescr'],
      nameLegend: '{{ifDescr}} · {{instance}}',
      columns: [
        { title: 'Status', expr: `ifOperStatus{${S}}`, unit: 'bool' },
        { title: 'Speed', expr: `ifHighSpeed{${S}} * 1000000`, unit: 'bps' },
        { title: 'RX', expr: `rate(ifHCInOctets{${S}}[5m]) * 8`, unit: 'bps' },
        { title: 'TX', expr: `rate(ifHCOutOctets{${S}}[5m]) * 8`, unit: 'bps' },
      ],
    },
  ],
}

export const grafanaBoards: Record<string, BoardSpec> = {
  traefik,
  blackbox,
  host,
  containers,
  mikrotik,
}

export type BoardName = keyof typeof grafanaBoards
