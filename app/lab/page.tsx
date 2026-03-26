import { getConfig } from '@/lib/config'
import HostMetrics from '@/components/lab/HostMetrics'
import ContainerList from '@/components/lab/ContainerList'
import RustDeskWidget from '@/components/lab/RustDeskWidget'
import TechNews from '@/components/lab/TechNews'
import LabQuickLinks from '@/components/lab/LabQuickLinks'
import TaskQueueWidget from '@/components/lab/TaskQueueWidget'
import GoalMilestoneWidget from '@/components/lab/GoalMilestoneWidget'
import AgentTerminalWidget from '@/components/lab/AgentTerminalWidget'
import LabMonitor from '@/components/lab/LabMonitor'
import ViewToggle from '@/components/shared/ViewToggle'
import AuthIndicator from '@/components/shared/AuthIndicator'
import RefreshButton from '@/components/lab/RefreshButton'
import WebTerminal from '@/components/lab/WebTerminal'
import DiscordChat from '@/components/lab/DiscordChat'
import SecurityWidget from '@/components/lab/SecurityWidget'

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

      {/* Top row: Host Metrics (full width — ring gauges need room) */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 mb-4">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Host Metrics</h2>
        <HostMetrics />
      </div>

      {/* Goals / Big Picture widget */}
      <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 mb-4" style={{ borderColor: 'rgb(88 28 135 / 0.3)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-purple-400/80 uppercase tracking-wider">Goals & Milestones</h2>
        </div>
        <GoalMilestoneWidget />
      </div>

      {/* Middle row: Containers + AI Task Queue */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Containers</h2>
          <ContainerList />
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex flex-col">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">AI Task Queue</h2>
          <TaskQueueWidget />
        </div>
      </div>

      {/* Full-width Lab Monitor: Services | WAN & Network | DNS */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 mb-4">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Lab Monitor</h2>
        <LabMonitor />
      </div>

      {/* Security */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 mb-4">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Security Posture</h2>
        <SecurityWidget />
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

      {/* Discord Chat Bridge */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 mb-4">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Discord Bridge</h2>
        <DiscordChat />
      </div>

      {/* Agent Terminal (Wren live activity) */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 mb-4">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Agent Terminal — Wren</h2>
        <AgentTerminalWidget agent="wren" />
      </div>

      {/* Web Terminal */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 mb-4">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Web Terminal</h2>
        <WebTerminal />
      </div>

      {/* Quick Links */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Lab Quick Links</h2>
        <LabQuickLinks links={config.lab.quick_links} />
      </div>
    </div>
  )
}
