import { getConfig } from '@/lib/config'
import ServiceGrid from '@/components/lab/ServiceGrid'
import HostMetrics from '@/components/lab/HostMetrics'
import ContainerList from '@/components/lab/ContainerList'
import RustDeskWidget from '@/components/lab/RustDeskWidget'
import TechNews from '@/components/lab/TechNews'
import LabQuickLinks from '@/components/lab/LabQuickLinks'
import TaskQueueWidget from '@/components/lab/TaskQueueWidget'
import LabMonitor from '@/components/lab/LabMonitor'
import ViewToggle from '@/components/shared/ViewToggle'
import AuthIndicator from '@/components/shared/AuthIndicator'
import RefreshButton from '@/components/lab/RefreshButton'

export const dynamic = 'force-dynamic'

export default function LabPage() {
  const config = getConfig()

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">AZ-Lab Dashboard</h1>
          <p className="text-xs text-zinc-500 mt-0.5">{config.site.title}</p>
        </div>
        <div className="flex items-center gap-2">
          <AuthIndicator />
          <RefreshButton />
          <ViewToggle currentView="lab" />
        </div>
      </div>

      {/* Top row: Service Status + Host Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Service Status</h2>
          <ServiceGrid />
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Host Metrics</h2>
          <HostMetrics />
        </div>
      </div>

      {/* Middle row: Containers + AI Task Queue */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Containers</h2>
          <ContainerList />
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">AI Task Queue</h2>
          <TaskQueueWidget />
        </div>
      </div>

      {/* Full-width Lab Monitor: Services | WAN & Network | DNS */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 mb-4">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Lab Monitor</h2>
        <LabMonitor />
      </div>

      {/* Bottom row: RustDesk + Tech News */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">RustDesk</h2>
          <RustDeskWidget />
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Tech News</h2>
          <TechNews />
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Lab Quick Links</h2>
        <LabQuickLinks links={config.lab.quick_links} />
      </div>
    </div>
  )
}
