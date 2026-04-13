'use client'

import { useEffect, useRef, useState } from 'react'

interface ArticleData {
  url: string
  title: string
  byline: string | null
  content: string
  readingTime: number
  excerpt: string | null
  siteName: string | null
  cachedAt: string
}

interface Props {
  url: string | null
  title?: string
  source?: string
  pubDate?: string
  onClose: () => void
}

function formatAge(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    const mins = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return '' }
}

export default function ArticleReaderPane({ url, title, source, pubDate, onClose }: Props) {
  const [article, setArticle] = useState<ArticleData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const paneRef = useRef<HTMLDivElement>(null)
  const prevUrl = useRef<string | null>(null)

  useEffect(() => {
    if (!url || url === prevUrl.current) return
    prevUrl.current = url
    setArticle(null)
    setError(null)
    setLoading(true)
    setSaveState('idle')

    fetch(`/api/article?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
        } else {
          setArticle(data)
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [url])

  // Reset save state when url changes
  useEffect(() => { setSaveState('idle') }, [url])

  // Escape key closes pane
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Click outside closes on mobile overlay
  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  async function handleSaveToQueue() {
    if (!url || saveState === 'saving' || saveState === 'saved') return
    setSaveState('saving')
    try {
      const res = await fetch('/api/save-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          title: article?.title ?? title ?? '',
          excerpt: article?.excerpt ?? '',
          source: article?.siteName ?? source ?? '',
        }),
      })
      if (res.ok) {
        setSaveState('saved')
      } else {
        setSaveState('error')
      }
    } catch {
      setSaveState('error')
    }
  }

  const open = url !== null

  const saveLabel =
    saveState === 'saving' ? 'Saving…' :
    saveState === 'saved'  ? 'Saved ✓' :
    saveState === 'error'  ? 'Save failed' :
    'Save to queue'

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 z-40 md:hidden transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={handleBackdropClick}
      />

      {/* Slide-in pane */}
      <div
        ref={paneRef}
        className={`
          fixed top-0 right-0 h-full z-50 bg-zinc-900 border-l border-zinc-700/60
          flex flex-col overflow-hidden
          transition-transform duration-300 ease-in-out
          w-full md:w-[58%] lg:w-[52%]
          ${open ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-zinc-700/60 bg-zinc-900/95 backdrop-blur flex-shrink-0">
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors text-sm"
            title="Close (Esc)"
          >
            ← Back
          </button>
          <span className="text-zinc-700">|</span>
          <div className="flex-1 min-w-0">
            {source && (
              <span className="text-[11px] text-zinc-500 font-medium">
                {source}
                {pubDate && <span className="text-zinc-700"> · {formatAge(pubDate)}</span>}
              </span>
            )}
          </div>
          <button
            onClick={handleSaveToQueue}
            disabled={saveState === 'saving' || saveState === 'saved'}
            title="Save to task queue"
            className={`text-xs transition-colors flex-shrink-0 px-2 py-1 rounded ${
              saveState === 'saved'
                ? 'text-emerald-400'
                : saveState === 'error'
                ? 'text-red-400 hover:text-red-300'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {saveLabel}
          </button>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 hover:text-zinc-200 transition-colors text-sm flex-shrink-0"
              title="Open original"
            >
              ↗
            </a>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="w-6 h-6 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
              <span className="text-sm text-zinc-600">Extracting article…</span>
            </div>
          )}

          {error && !loading && (
            <div className="p-6 space-y-4">
              {title && (
                <h1 className="text-xl font-semibold text-zinc-200 leading-snug">{title}</h1>
              )}
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
                <p className="text-sm text-amber-400 font-medium">Could not extract article</p>
                <p className="text-xs text-zinc-500">{error}</p>
              </div>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 hover:text-white text-sm font-medium transition-colors"
                >
                  Read on original site ↗
                </a>
              )}
            </div>
          )}

          {article && !loading && (
            <div className="p-6 pb-16 space-y-4">
              {/* Article header */}
              <div className="space-y-2">
                <h1 className="text-xl font-semibold text-zinc-100 leading-snug">
                  {article.title}
                </h1>
                <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
                  {article.byline && <span>{article.byline}</span>}
                  {article.byline && article.readingTime && <span>·</span>}
                  {article.readingTime && <span>~{article.readingTime} min read</span>}
                  {article.siteName && (
                    <>
                      <span>·</span>
                      <span>{article.siteName}</span>
                    </>
                  )}
                </div>
              </div>

              <hr className="border-zinc-700/60" />

              {/* Article body */}
              <div
                className="article-body prose-sm text-zinc-300"
                dangerouslySetInnerHTML={{ __html: article.content }}
              />

              {/* Footer actions */}
              <div className="flex items-center gap-3 pt-4 border-t border-zinc-700/40">
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 hover:text-white text-xs font-medium transition-colors"
                  >
                    Open original ↗
                  </a>
                )}
                <button
                  onClick={handleSaveToQueue}
                  disabled={saveState === 'saving' || saveState === 'saved'}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    saveState === 'saved'
                      ? 'bg-emerald-600/20 text-emerald-400 cursor-default'
                      : saveState === 'error'
                      ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
                      : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white'
                  }`}
                >
                  {saveLabel}
                </button>
                <span className="text-[10px] text-zinc-700 ml-auto">cached {formatAge(article.cachedAt)}</span>
              </div>
            </div>
          )}

          {!url && !loading && (
            <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
              Select an article to read
            </div>
          )}
        </div>
      </div>
    </>
  )
}
