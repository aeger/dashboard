import type { ComponentType } from 'react'
import HostMetrics from '@/components/lab/HostMetrics'
import HostMetricsCharts from '@/components/lab/HostMetricsCharts'
import LabMonitor from '@/components/lab/LabMonitor'
import AgentHealthCard from '@/components/lab/AgentHealthCard'
import ClaudeSpendWidget from '@/components/lab/ClaudeSpendWidget'
import SecurityWidget from '@/components/lab/SecurityWidget'
import BackupsWidget from '@/components/lab/BackupsWidget'
import StoragePools from '@/components/lab/StoragePools'
import EndpointProbes from '@/components/lab/EndpointProbes'

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
  /** Detail route for the header "expand" link. */
  expandHref?: string
  /** Tailwind text-color class for the header label. */
  accent?: string
  /** Widget draws its own card header — skip the standard LabTile header. */
  bare?: boolean
  /** Set false to hide a tile without deleting its entry. Default: shown. */
  enabled?: boolean
}

/** Host Metrics tile pairs the stat grid with its sparkline charts. */
function HostMetricsPanel() {
  return (
    <>
      <HostMetrics />
      <HostMetricsCharts />
    </>
  )
}

export const labWidgets: LabWidget[] = [
  {
    id: 'host-metrics',
    section: 'Infrastructure',
    title: 'Host Metrics',
    component: HostMetricsPanel,
    endpoint: '/api/metrics',
    expandHref: '/lab/monitor',
  },
  {
    id: 'lab-monitor',
    section: 'Infrastructure',
    title: 'Lab Monitor',
    component: LabMonitor,
    endpoint: '/api/services',
    expandHref: '/lab/monitor',
  },
  {
    id: 'endpoint-health',
    section: 'Infrastructure',
    title: 'Endpoint Health',
    component: EndpointProbes,
    endpoint: '/api/probes',
    expandHref: '/lab/monitor',
  },
  {
    id: 'storage-pools',
    section: 'Infrastructure',
    title: 'Storage / ZFS Pools',
    component: StoragePools,
    endpoint: '/api/storage',
    expandHref: '/lab/monitor',
  },
  {
    id: 'agent-health',
    section: 'Agents & Spend',
    component: AgentHealthCard,
    endpoint: '/api/agent-health',
    bare: true,
  },
  {
    id: 'claude-spend',
    section: 'Agents & Spend',
    title: 'Claude Spend',
    component: ClaudeSpendWidget,
    endpoint: '/api/claude-spend',
    accent: 'text-emerald-400/70',
    expandHref: '/lab/monitor',
  },
  {
    id: 'security',
    section: 'Security & Backups',
    title: 'Security',
    component: SecurityWidget,
    endpoint: '/api/security',
    expandHref: '/lab/security',
  },
  {
    id: 'backups',
    section: 'Security & Backups',
    component: BackupsWidget,
    endpoint: '/api/backups',
    bare: true,
  },
]
