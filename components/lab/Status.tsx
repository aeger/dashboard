/**
 * Shared status vocabulary for lab widgets — ONE chip and ONE dot, used
 * everywhere (AgentHealthCard, BackupsWidget, LabMonitor, EndpointProbes…),
 * so identical states look identical across tiles.
 */

export type StatusTone = 'ok' | 'warn' | 'crit' | 'info' | 'dim'

const CHIP: Record<StatusTone, string> = {
  ok: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50',
  warn: 'bg-amber-900/40 text-amber-300 border-amber-700/40',
  crit: 'bg-red-900/50 text-red-300 border-red-700/50',
  info: 'bg-blue-900/40 text-blue-300 border-blue-700/40',
  dim: 'bg-zinc-800/60 text-zinc-500 border-zinc-700/50',
}

const DOT: Record<StatusTone, string> = {
  ok: 'bg-emerald-400',
  warn: 'bg-amber-400',
  crit: 'bg-red-400',
  info: 'bg-blue-400',
  dim: 'bg-zinc-600',
}

export function StatusChip({
  tone,
  className = '',
  children,
}: {
  tone: StatusTone
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide whitespace-nowrap ${CHIP[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function StatusDot({
  tone,
  pulse = false,
  className = '',
}: {
  tone: StatusTone
  pulse?: boolean
  className?: string
}) {
  return (
    <span
      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT[tone]} ${pulse ? 'animate-pulse' : ''} ${className}`}
    />
  )
}
