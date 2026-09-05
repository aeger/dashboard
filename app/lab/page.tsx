import AuthIndicator from '@/components/shared/AuthIndicator'
import RefreshButton from '@/components/lab/RefreshButton'
import AgentHealthBanner from '@/components/shared/AgentHealthBanner'
import GmailReauthBanner from '@/components/lab/GmailReauthBanner'
import ToolPills from '@/components/lab/ToolPills'
import StatusPills from '@/components/lab/StatusPills'
import LabTile from '@/components/lab/LabTile'
import Section from '@/components/ui/Section'
import { labWidgets, labSectionOrder } from '@/lib/lab-widgets'

export const dynamic = 'force-dynamic'

export default function LabPage() {
  return (
    <div className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto">
      <AgentHealthBanner />
      <GmailReauthBanner />

      {/* Page action bar — two tidy rows: tools + auth, then status pills.
          (Single-row justify-between wrapped awkwardly once both grew.) */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <ToolPills />
          <div className="flex items-center gap-2 ml-auto">
            <AuthIndicator />
            <RefreshButton />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusPills />
        </div>
      </div>

      {/* Tiles are driven entirely by the registry, grouped into sections —
          add a tile in lib/lab-widgets.tsx, not here. See docs/widgets.md. */}
      {labSectionOrder.map((section, i) => {
        const widgets = labWidgets.filter((w) => w.enabled !== false && w.section === section)
        if (widgets.length === 0) return null
        return (
          <section key={section} className="mb-6">
            <Section no={String(i + 1).padStart(2, '0')} title={section} className="px-1" />
            {/* 12-col grid at lg+; tiles declare their span in the registry and
                stack full-width below lg. Default stretch alignment equalizes
                card heights per row — short-next-to-tall reads intentional
                instead of leaving ragged holes. An expanded tile grows to the
                full row. */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
              {widgets.map((w) => {
                const Widget = w.component
                const Detail = w.detail
                return (
                  <LabTile
                    key={w.id}
                    id={w.id}
                    title={w.title}
                    accent={w.accent}
                    span={w.span}
                    // Pass a rendered node, not the component fn — this page is a
                    // server component and LabTile is a client component.
                    detail={Detail ? <Detail /> : undefined}
                    detailLabel={w.detailLabel}
                    expandHref={w.expandHref}
                    bare={w.bare}
                  >
                    <Widget />
                  </LabTile>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
