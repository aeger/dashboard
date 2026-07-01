import AuthIndicator from '@/components/shared/AuthIndicator'
import RefreshButton from '@/components/lab/RefreshButton'
import AgentHealthBanner from '@/components/shared/AgentHealthBanner'
import GmailReauthBanner from '@/components/lab/GmailReauthBanner'
import ToolPills from '@/components/lab/ToolPills'
import StatusPills from '@/components/lab/StatusPills'
import LabTile from '@/components/lab/LabTile'
import { labWidgets } from '@/lib/lab-widgets'

export const dynamic = 'force-dynamic'

export default function LabPage() {
  return (
    <div className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto">
      <AgentHealthBanner />
      <GmailReauthBanner />

      {/* Page action bar */}
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        {/* Tool shortcuts — wraps to second row when crowded */}
        <div className="flex items-center gap-2 flex-wrap">
          <ToolPills />
        </div>
        {/* Status pills + auth — grouped right, always justified right */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap ml-auto">
          <StatusPills />
          <AuthIndicator />
          <RefreshButton />
        </div>
      </div>

      {/* Tiles are driven entirely by the registry — add a tile in
          lib/lab-widgets.tsx, not here. See docs/widgets.md. */}
      <div className="space-y-4">
        {labWidgets
          .filter((w) => w.enabled !== false)
          .map((w) => {
            const Widget = w.component
            return (
              <LabTile
                key={w.id}
                id={w.id}
                title={w.title}
                accent={w.accent}
                expandHref={w.expandHref}
                bare={w.bare}
              >
                <Widget />
              </LabTile>
            )
          })}
      </div>
    </div>
  )
}
