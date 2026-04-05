import { getConfig } from '@/lib/config'
import HostMetrics from '@/components/lab/HostMetrics'
import ContainerList from '@/components/lab/ContainerList'
import RustDeskWidget from '@/components/lab/RustDeskWidget'
import TechNews from '@/components/lab/TechNews'
import LabQuickLinks from '@/components/lab/LabQuickLinks'
import TaskQueueWidget from '@/components/lab/TaskQueueWidget'
import GoalMilestoneWidget from '@/components/lab/GoalMilestoneWidget'
import LabMonitor from '@/components/lab/LabMonitor'
import ViewToggle from '@/components/shared/ViewToggle'
import AuthIndicator from '@/components/shared/AuthIndicator'
import RefreshButton from '@/components/lab/RefreshButton'
import SecurityWidget from '@/components/lab/SecurityWidget'
import AgentHealthBanner from '@/components/shared/AgentHealthBanner'
import TerminalHub from '@/components/lab/TerminalHub'
import ProxiesWidget from '@/components/lab/ProxiesWidget'

export const dynamic = 'force-dynamic'

// Shared card classes — zinc base + lift on hover
const card = 'relative card-lift bg-zinc-900/50 border border-zinc-800/70 rounded-xl p-4'
const cardPurple = 'relative card-lift bg-zinc-900/50 rounded-xl p-4'
  + ' border border-purple-700/40'
  + ' shadow-[inset_0_0_60px_rgba(109,40,217,0.08),0_0_0_1px_rgba(167,139,250,0.08)]'

export default function LabPage() {
  const config = getConfig()

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto">
      <AgentHealthBanner />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">AZ-Lab</h1>
          <p className="text-xs text-zinc-600 mt-0.5">svc-podman-01 · 192.168.1.181</p>
        </div>
        <div className="flex items-center gap-2">
          <AuthIndicator />
          <RefreshButton />
          <ViewToggle currentView="lab" />
        </div>
      </div>

      {/* Host Metrics */}
      <div className={`${card} mb-4`}>
        <h2 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-3">Host Metrics</h2>
        <HostMetrics />
      </div>

      {/* Goals — purple accent card */}
      <div className={`${cardPurple} mb-4`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[10px] font-semibold text-purple-400/70 uppercase tracking-widest">Goals & Milestones</h2>
        </div>
        <GoalMilestoneWidget />
      </div>

      {/* Containers + Task Queue */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className={card}>
          <h2 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-3">Containers</h2>
          <ContainerList />
        </div>
        <div className={`${card} flex flex-col`}>
          <h2 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-3">AI Task Queue</h2>
          <TaskQueueWidget />
        </div>
      </div>

      {/* Lab Monitor */}
      <div className={`${card} mb-4`}>
        <h2 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-3">Lab Monitor</h2>
        <LabMonitor />
      </div>

      {/* Security */}
      <div className={`${card} mb-4`}>
        <h2 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-3">Security Posture</h2>
        <SecurityWidget />
      </div>

      {/* RustDesk + Tech News */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className={card}>
          <h2 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-3">RustDesk</h2>
          <RustDeskWidget />
        </div>
        <div className={card}>
          <h2 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-3">Tech News</h2>
          <TechNews />
        </div>
      </div>

      {/* Terminal Hub */}
      <div className={`${card} mb-4`}>
        <TerminalHub />
      </div>

      {/* Proxy Manager */}
      <div className={`${card} mb-4`}>
        <h2 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-3">Proxy Manager</h2>
        <ProxiesWidget />
      </div>

      {/* Quick Links */}
      <div className={card}>
        <h2 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-3">Quick Links</h2>
        <LabQuickLinks links={config.lab.quick_links} />
      </div>
    </div>
  )
}
