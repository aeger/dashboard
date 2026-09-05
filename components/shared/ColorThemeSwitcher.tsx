'use client'

import { useEffect, useState } from 'react'
import { themes, defaultThemeId, applyTheme, THEME_STORAGE_KEY, type ThemeId } from '@/lib/colorThemes'

/**
 * Accessible color-theme switcher (Graphite / Daylight / Universal).
 * Persists to localStorage and sets [data-color-theme] on <html>.
 * Fixed control, bottom-left (ScrollToTop lives bottom-right).
 */
export default function ColorThemeSwitcher() {
  const [id, setId] = useState<ThemeId>(defaultThemeId)
  const [open, setOpen] = useState(false)

  // Sync initial state from what the pre-paint script / storage already set.
  useEffect(() => {
    const saved = (typeof document !== 'undefined'
      && document.documentElement.getAttribute('data-color-theme')) as ThemeId | null
    if (saved && saved in themes) setId(saved)
    else {
      try {
        const ls = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null
        if (ls && ls in themes) { setId(ls); applyTheme(ls) }
      } catch { /* ignore */ }
    }
  }, [])

  function choose(next: ThemeId) {
    setId(next)
    applyTheme(next)
    setOpen(false)
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change color theme"
        className="flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/90 px-3 py-1.5 font-medium text-zinc-200 shadow-lg backdrop-blur transition hover:border-zinc-600"
        style={{ borderColor: 'var(--t-bord2)', background: 'color-mix(in srgb, var(--t-surf) 90%, transparent)' }}
      >
        <span aria-hidden style={{ color: 'var(--t-acc)' }}>◆</span>
        {themes[id].label}
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute bottom-full mb-2 w-40 overflow-hidden rounded-lg border shadow-xl"
          style={{ borderColor: 'var(--t-bord2)', background: 'var(--t-surf)' }}
        >
          {(Object.keys(themes) as ThemeId[]).map((tid) => (
            <li key={tid}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={tid === id}
                onClick={() => choose(tid)}
                className="flex w-full items-center justify-between px-3 py-2 text-left transition"
                style={{
                  color: 'var(--t-tx)',
                  background: tid === id ? 'var(--t-accsoft)' : 'transparent',
                }}
              >
                <span>{themes[tid].label}</span>
                <span aria-hidden style={{ color: 'var(--t-txd)' }}>
                  {themes[tid].colorSafe ? 'CVD-safe' : themes[tid].base}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
