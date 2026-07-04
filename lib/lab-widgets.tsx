import type { ComponentType } from 'react'
import HostMetrics from '@/components/lab/HostMetrics'
import LabMonitor, { MonitorDetail } from '@/components/lab/LabMonitor'
import AgentHealthCard from '@/components/lab/AgentHealthCard'
import ClaudeSpendWidget, { ClaudeSpendDetail } from '@/components/lab/ClaudeSpendWidget'
import SecurityWidget, { SecurityDetail } from '@/components/lab/SecurityWidget'
import BackupsWidget from '@/components/lab/BackupsWidget'
import StoragePools, { StorageDatasets } from '@/components/lab/StoragePools'
import EndpointProbes from '@/components/lab/EndpointProbes'
import GrafanaBoard from '@/components/lab/GrafanaBoard'

/**
 * Lab widget registry — the single source of truth for the /lab landing page.
 *
 * DATA-SOURCE CONTRACT (see docs/widgets.md):
 *  - Each widget is a self-contained component that fetches its OWN data from
 *    the API route named in `endpoint`, using the shared `useWidgetData` hook.
 *  - The page never fetches on a widget's behalf; it only lays out tiles.
 *  - To add a tile: build the component + its /api route, then add ONE entry
 *    here. No edits to app/lab/page.tsx are required.
 */
/** Landing-page section a tile belongs to. Rendered in `labSectionOrder`. */
export type LabSection = 'Infrastructure' | 'Agents & Spend' | 'Security & Backups'

/** Order sections render top-to-bottom on the /lab landing page. */
export const labSectionOrder: LabSection[] = [
  'Infrastructure',
  'Agents & Spend',
  'Security & Backups',
]

export interface LabWidget {
  /** Stable id — also the DOM anchor (e.g. StatusPills links to #security). */
  id: string
  /** Landing-page section grouping. */
  section: LabSection
  /** Header label. Omit for `bare` widgets that render their own header. */
  title?: string
  /** The tile component. */
  component: ComponentType
  /** The API route this widget consumes — documents the data-source contract. */
  endpoint?: string
  /** Grid columns at lg+ (4/5/6/7/8/12). Default 12. Rows should sum to 12. */
  span?: number
  /** In-place expand content, revealed inline by LabTile — no navigation. */
  detail?: ComponentType
  /** Label for the in-place expand toggle (default "expand"). */
  detailLabel?: string
  /** Deep link to a full detail route — the header "⤢" link. Only give one
   *  where a genuinely richer page exists; in-place `detail` replaces the old
   *  everything-links-to-/lab/monitor pattern. */
  expandHref?: string
  /** Tailwind text-color class for the header label. */
  accent?: string
  /** Widget draws its own card header — skip the standard LabTile header. */
  bare?: boolean
  /** Set false to hide a tile without deleting its entry. Default: shown. */
  enabled?: boolean
}

// Grafana-parity expand boards (see lib/grafana-boards.ts + docs/widgets.md).
const HostOverviewBoard = () => <GrafanaBoard board="host" />
const BlackboxBoard = () => <GrafanaBoard board="blackbox" />

export const labWidgets: LabWidget[] = [
  {
    id: 'host-metrics',
    section: 'Infrastructure',
    title: 'Host Metrics',
    component: HostMetrics,
    endpoint: '/api/metrics',
    span: 8,
    detail: HostOverviewBoard,
    detailLabel: 'host overview',
    expandHref: '/lab/monitor',
  },
  {
    id: 'storage-pools',
    section: 'Infrastructure',
    title: 'Storage · ZFS',
    component: StoragePools,
    endpoint: '/api/storage',
    span: 4,
    detail: StorageDatasets,
    detailLabel: 'datasets',
  },
  {
    id: 'lab-monitor',
    section: 'Infrastructure',
    title: 'Services',
    component: LabMonitor,
    endpoint: '/api/services (+ /api/network, /api/dns per tab)',
    span: 7,
    detail: MonitorDetail,
    detailLabel: 'all monitors',
    expandHref: '/lab/monitor',
  },
  {
    id: 'endpoint-health',
    section: 'Infrastructure',
    title: 'Endpoint Health',
    component: EndpointProbes,
    endpoint: '/api/probes',
    span: 5,
    detail: BlackboxBoard,
    detailLabel: 'uptime & ssl',
  },
  {
    id: 'agent-health',
    section: 'Agents & Spend',
    component: AgentHealthCard,
    endpoint: '/api/agent-health',
    span: 5,
    bare: true,
  },
  {
    id: 'claude-spend',
    section: 'Agents & Spend',
    title: 'Claude Spend',
    component: ClaudeSpendWidget,
    endpoint: '/api/claude-spend',
    accent: 'text-emerald-400/70',
    span: 7,
    detail: ClaudeSpendDetail,
    detailLabel: 'by model',
  },
  {
    id: 'security',
    section: 'Security & Backups',
    title: 'Security',
    component: SecurityWidget,
    endpoint: '/api/security',
    span: 7,
    detail: SecurityDetail,
    detailLabel: 'findings',
    expandHref: '/lab/security',
  },
  {
    id: 'backups',
    section: 'Security & Backups',
    component: BackupsWidget,
    endpoint: '/api/backups',
    span: 5,
    bare: true,
  },
]
