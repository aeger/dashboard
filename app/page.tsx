import { getConfig } from '@/lib/config'
import { readMessage } from '@/lib/message'
import ClockWidget from '@/components/family/ClockWidget'
import WeatherWidget from '@/components/family/WeatherWidget'
import PhotoSlideshow from '@/components/family/PhotoSlideshow'
import MessageBlock from '@/components/family/MessageBlock'
import QuickLinks from '@/components/family/QuickLinks'
import NewsWidget from '@/components/family/NewsWidget'
import CalendarWidget from '@/components/family/CalendarWidget'
import ViewToggle from '@/components/shared/ViewToggle'
import AuthIndicator from '@/components/shared/AuthIndicator'

export const dynamic = 'force-dynamic'

export default function FamilyPage() {
  const config = getConfig()
  const message = readMessage()

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Cook Family" className="w-12 h-12 rounded-full" />
          <ClockWidget />
        </div>
        <div className="flex items-center gap-2">
          <AuthIndicator />
          <ViewToggle currentView="family" />
        </div>
      </div>

      {/* Message Block */}
      <div className="mb-4">
        <MessageBlock initialMessage={message} />
      </div>

      {/* Calendar — Star of the show, full width */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 mb-4">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          Family Calendar
        </h2>
        <CalendarWidget />
      </div>

      {/* Weather + Photos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 min-h-52">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Weather</h2>
          <WeatherWidget />
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden min-h-52">
          <PhotoSlideshow intervalSeconds={config.family.photo_interval_seconds} />
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 mb-4">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Quick Links</h2>
        <QuickLinks links={config.family.quick_links} />
      </div>

      {/* News */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">News</h2>
        <NewsWidget />
      </div>
    </div>
  )
}
