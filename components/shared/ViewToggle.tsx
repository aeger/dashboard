'use client'

import { useRouter } from 'next/navigation'

interface ViewToggleProps {
  currentView: 'family' | 'lab'
}

export default function ViewToggle({ currentView }: ViewToggleProps) {
  const router = useRouter()

  return (
    <button
      onClick={() => router.push(currentView === 'family' ? '/lab' : '/')}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm text-zinc-300 hover:text-white transition-all"
      title={currentView === 'family' ? 'Switch to Lab view' : 'Switch to Family view'}
    >
      {currentView === 'family' ? (
        <>
          <span>⚗️</span>
          <span>Lab</span>
        </>
      ) : (
        <>
          <span>🏠</span>
          <span>Home</span>
        </>
      )}
    </button>
  )
}
