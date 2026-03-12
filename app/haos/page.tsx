import { getConfig } from '@/lib/config'
import ViewToggle from '@/components/shared/ViewToggle'
import HADashboard from '@/components/haos/HADashboard'

export const dynamic = 'force-dynamic'

export default function HAOSPage() {
  const config = getConfig()
  const haUrl = config.homeassistant?.url ?? 'https://ha.az-lab.dev'
  const defaultDashboard = config.homeassistant?.default_dashboard ?? '/home/overview'

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-950 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-white">Home Assistant</h1>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle currentView="haos" />
        </div>
      </div>

      {/* HA Dashboard iframe */}
      <HADashboard haUrl={haUrl} defaultDashboard={defaultDashboard} />
    </div>
  )
}
