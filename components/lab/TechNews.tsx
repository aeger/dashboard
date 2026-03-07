'use client'

import { useEffect, useState } from 'react'
import FeedEditor from '@/components/shared/FeedEditor'

interface NewsItem {
  title: string
  link: string
  pubDate: string
  source: string
}

export default function TechNews() {
  const [items, setItems] = useState<NewsItem[]>([])
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showEditor, setShowEditor] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/news?type=lab')
      const data = await res.json()
      setItems(data.items ?? [])
      setCachedAt(data.cachedAt ?? null)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [reloadKey])

  return (
    <>
      {showEditor && (
        <FeedEditor
          type="lab"
          onClose={() => setShowEditor(false)}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-600">
            {loading ? '' : cachedAt ? `cached ${formatAge(cachedAt)}` : 'live'}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowEditor(true)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              edit feeds
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
            >
              refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-24">
            <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-zinc-500 text-sm text-center py-6">
            No tech news available — feeds may be throttled
          </div>
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {items.map((item, i) => (
              <li key={i}>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-zinc-600 mt-0.5 flex-shrink-0 font-mono">
                      {item.source.replace('r/', '')}
                    </span>
                    <span className="text-sm text-zinc-300 group-hover:text-white transition-colors line-clamp-2">
                      {item.title}
                    </span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function formatAge(dateStr: string): string {
  try {
    const mins = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    return `${Math.round(mins / 60)}h ago`
  } catch {
    return ''
  }
}
