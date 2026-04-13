'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import FeedEditor from '@/components/shared/FeedEditor'
import ArticleReaderPane from '@/components/shared/ArticleReaderPane'

interface NewsItem {
  title: string
  link: string
  pubDate: string
  source: string
  summary?: string
  imageUrl?: string
  feedType?: 'lab' | 'family'
}

const READ_LS_KEY = 'az_news_read'
const MAX_READ_STORED = 500

function getReadSet(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_LS_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

function persistRead(links: Set<string>) {
  try {
    const arr = [...links].slice(-MAX_READ_STORED)
    localStorage.setItem(READ_LS_KEY, JSON.stringify(arr))
  } catch {}
}

function formatAge(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const mins = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return '' }
}

type FilterType = 'all' | 'lab' | 'family'
type EditorState = { open: boolean; type: 'lab' | 'family' }

export default function NewsReader() {
  const [items, setItems] = useState<NewsItem[]>([])
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [readerUrl, setReaderUrl] = useState<string | null>(null)
  const [readerItem, setReaderItem] = useState<NewsItem | null>(null)
  const [readLinks, setReadLinks] = useState<Set<string>>(new Set())
  const [editor, setEditor] = useState<EditorState>({ open: false, type: 'lab' })
  const [reloadKey, setReloadKey] = useState(0)
  const [focusedIdx, setFocusedIdx] = useState<number>(-1)
  const listRef = useRef<HTMLDivElement>(null)

  // Load read state from localStorage on mount
  useEffect(() => {
    setReadLinks(getReadSet())
  }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/news?type=all')
      const data = await res.json()
      setItems(data.items ?? [])
      setCachedAt(data.cachedAt ?? null)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [reloadKey])

  function markRead(link: string) {
    setReadLinks((prev) => {
      const next = new Set(prev)
      next.add(link)
      persistRead(next)
      return next
    })
  }

  function markUnread(link: string, e: React.MouseEvent) {
    e.stopPropagation()
    setReadLinks((prev) => {
      const next = new Set(prev)
      next.delete(link)
      persistRead(next)
      return next
    })
  }

  function openInReader(item: NewsItem) {
    setReaderUrl(item.link)
    setReaderItem(item)
    markRead(item.link)
  }

  function handleExpand(link: string) {
    if (expanded === link) {
      setExpanded(null)
    } else {
      setExpanded(link)
      markRead(link)
    }
  }

  function openArticle(e: React.MouseEvent, link: string) {
    e.stopPropagation()
    markRead(link)
    window.open(link, '_blank', 'noopener,noreferrer')
  }

  function clearAllRead() {
    setReadLinks(new Set())
    try { localStorage.removeItem(READ_LS_KEY) } catch {}
  }

  const filtered = filter === 'all' ? items : items.filter((i) => i.feedType === filter)
  const labCount = items.filter((i) => i.feedType === 'lab').length
  const familyCount = items.filter((i) => i.feedType === 'family').length
  const unreadCount = filtered.filter((i) => !readLinks.has(i.link)).length

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && focusedIdx >= 0) {
      e.preventDefault()
      const item = filtered[focusedIdx]
      if (item) openInReader(item)
    } else if (e.key === ' ' && focusedIdx >= 0) {
      e.preventDefault()
      const item = filtered[focusedIdx]
      if (item) handleExpand(item.link)
    } else if (e.key === 'o' && focusedIdx >= 0) {
      const item = filtered[focusedIdx]
      if (item) { markRead(item.link); window.open(item.link, '_blank', 'noopener,noreferrer') }
    } else if (e.key === 'r' && focusedKey) {
      const item = filtered[focusedIdx]
      if (item) markRead(item.link)
    } else if (e.key === 'Escape') {
      setReaderUrl(null)
      setReaderItem(null)
    }
  }, [filtered, focusedIdx, expanded]) // eslint-disable-line react-hooks/exhaustive-deps

  const focusedKey = focusedIdx >= 0 ? filtered[focusedIdx]?.link : null

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIdx >= 0 && listRef.current) {
      const el = listRef.current.children[focusedIdx] as HTMLElement | undefined
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [focusedIdx])

  return (
    <>
      {editor.open && (
        <FeedEditor
          type={editor.type}
          onClose={() => setEditor((s) => ({ ...s, open: false }))}
          onSaved={() => { setEditor((s) => ({ ...s, open: false })); setReloadKey((k) => k + 1) }}
        />
      )}

      <ArticleReaderPane
        url={readerUrl}
        title={readerItem?.title}
        source={readerItem?.source}
        pubDate={readerItem?.pubDate}
        onClose={() => { setReaderUrl(null); setReaderItem(null) }}
      />

      <div className="min-h-screen p-4 md:p-6 max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="text-lg">📰</span>
            <h1 className="text-sm font-semibold text-zinc-300 tracking-wide uppercase">News Feed</h1>
            {!loading && unreadCount > 0 && (
              <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-medium">
                {unreadCount} unread
              </span>
            )}
            {cachedAt && !loading && (
              <span className="text-[10px] text-zinc-600">· cached {formatAge(cachedAt)}</span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setEditor({ open: true, type: 'lab' })}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              ⚙ Tech feeds
            </button>
            <button
              onClick={() => setEditor({ open: true, type: 'family' })}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              ⚙ Family feeds
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
            >
              {loading ? 'loading…' : 'refresh'}
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-4">
          {(['all', 'lab', 'family'] as FilterType[]).map((f) => {
            const count = f === 'all' ? items.length : f === 'lab' ? labCount : familyCount
            const active = filter === f
            const activeClass = f === 'lab'
              ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
              : f === 'family'
              ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
              : 'bg-zinc-700/60 text-zinc-200 border-zinc-600'
            const inactiveClass = 'text-zinc-500 hover:text-zinc-300 border-transparent hover:border-zinc-700'
            return (
              <button
                key={f}
                onClick={() => { setFilter(f); setFocusedIdx(-1) }}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${active ? activeClass : inactiveClass}`}
              >
                {f === 'all' ? 'All' : f === 'lab' ? 'Tech' : 'Family'}
                <span className={`ml-1 ${active ? 'opacity-70' : 'opacity-40'}`}>({count})</span>
              </button>
            )
          })}
          {unreadCount > 0 && (
            <button
              onClick={clearAllRead}
              className="ml-auto text-xs text-zinc-700 hover:text-zinc-500 transition-colors"
              title="Reset read state"
            >
              mark all unread
            </button>
          )}
          <span className="text-[10px] text-zinc-800 ml-2 hidden md:block">j/k navigate · enter read · space expand · o open</span>
        </div>

        {/* Article list */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-zinc-500 text-sm text-center py-16">
            No items — use ⚙ to add feeds
          </div>
        ) : (
          <div className="space-y-1" ref={listRef}>
            {filtered.map((item, idx) => {
              const isRead = readLinks.has(item.link)
              const isExpanded = expanded === item.link
              const isFocused = focusedKey === item.link
              const accent = item.feedType === 'lab' ? '#fb923c' : '#f59e0b'

              return (
                <div
                  key={item.link || idx}
                  className={`rounded-lg border transition-all cursor-pointer select-none ${
                    isExpanded
                      ? 'border-zinc-600 bg-zinc-800/60'
                      : isFocused
                      ? 'border-zinc-600 bg-zinc-800/40'
                      : 'border-zinc-800/60 hover:border-zinc-700 hover:bg-zinc-800/30'
                  }`}
                  onClick={() => { setFocusedIdx(idx); handleExpand(item.link) }}
                  onDoubleClick={(e) => { e.stopPropagation(); openInReader(item) }}
                >
                  {/* Article row */}
                  <div className="flex items-start gap-3 px-4 py-3">
                    {item.imageUrl && !isExpanded && (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="w-14 h-14 rounded-md object-cover flex-shrink-0 opacity-80"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm leading-snug transition-colors ${isRead && !isExpanded ? 'text-zinc-500' : 'text-zinc-200'}`}>
                        {item.title}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: `${accent}18`, color: accent }}
                        >
                          {item.source}
                        </span>
                        <span className="text-[10px] text-zinc-600">{formatAge(item.pubDate)}</span>
                        {isRead && !isExpanded && (
                          <button
                            className="text-[10px] text-zinc-700 hover:text-zinc-500 transition-colors"
                            onClick={(e) => markUnread(item.link, e)}
                            title="Mark unread"
                          >
                            · mark unread
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 self-center ml-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); openInReader(item) }}
                        className="p-1.5 rounded text-zinc-600 hover:text-blue-400 hover:bg-zinc-700 transition-colors text-[11px] font-medium"
                        title="Read in pane (Enter)"
                      >
                        Read
                      </button>
                      <button
                        onClick={(e) => openArticle(e, item.link)}
                        className="p-1.5 rounded text-zinc-600 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                        title="Open article in new tab"
                      >
                        ↗
                      </button>
                      <span className={`text-zinc-600 text-[10px] transition-transform duration-200 inline-block ${isExpanded ? 'rotate-180' : ''}`}>
                        ▾
                      </span>
                    </div>
                  </div>

                  {/* Expanded preview */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-zinc-700/50 pt-3">
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="w-full max-h-52 object-cover rounded-lg mb-3 opacity-90"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      )}
                      {item.summary ? (
                        <p className="text-sm text-zinc-400 leading-relaxed">
                          {item.summary}
                        </p>
                      ) : (
                        <p className="text-xs text-zinc-600 italic">No description in feed — click to read the full article.</p>
                      )}
                      <div className="flex items-center gap-3 mt-4">
                        <button
                          onClick={(e) => { e.stopPropagation(); openInReader(item) }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-medium transition-colors"
                        >
                          Read in pane
                        </button>
                        <button
                          onClick={(e) => openArticle(e, item.link)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 hover:text-white text-xs font-medium transition-colors"
                        >
                          Open original ↗
                        </button>
                        <button
                          onClick={(e) => markUnread(item.link, e)}
                          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                        >
                          mark unread
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpanded(null) }}
                          className="text-xs text-zinc-700 hover:text-zinc-500 transition-colors ml-auto"
                        >
                          collapse
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
