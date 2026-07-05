import LabSubNav from '@/components/lab/LabSubNav'
import ContainerListExpanded from '@/components/lab/ContainerListExpanded'
import GrafanaBoard from '@/components/lab/GrafanaBoard'

export const dynamic = 'force-dynamic'

const card = 'relative card-lift bg-zinc-900/50 border border-zinc-800/70 rounded-xl p-4'

export default function ContainersPage() {
  return (
    <div className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto">
      <LabSubNav />
      <div className={`${card} mb-4`}>
        <ContainerListExpanded />
      </div>
      {/* Grafana "Container Overview — cAdvisor + Podman" parity */}
      <div className={card}>
        <h2 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-4">
          Container Metrics — cAdvisor + Podman
        </h2>
        <GrafanaBoard board="containers" />
      </div>
    </div>
  )
}
