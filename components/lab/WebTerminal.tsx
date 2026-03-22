'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import 'xterm/css/xterm.css'

type Status = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

export default function WebTerminal() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>('idle')
  const cleanupRef = useRef<(() => void) | null>(null)

  const connect = useCallback(async () => {
    if (status === 'connecting' || status === 'connected') return
    setStatus('connecting')

    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import('xterm'),
      import('xterm-addon-fit'),
    ])

    if (!containerRef.current) { setStatus('error'); return }

    // Clear any previous terminal content
    containerRef.current.innerHTML = ''

    const term = new Terminal({
      theme: {
        background: '#09090b',
        foreground: '#e4e4e7',
        cursor: '#a1a1aa',
        selectionBackground: '#3f3f46',
        black: '#18181b', brightBlack: '#3f3f46',
        red: '#f87171', brightRed: '#fca5a5',
        green: '#4ade80', brightGreen: '#86efac',
        yellow: '#facc15', brightYellow: '#fde047',
        blue: '#60a5fa', brightBlue: '#93c5fd',
        magenta: '#c084fc', brightMagenta: '#d8b4fe',
        cyan: '#22d3ee', brightCyan: '#67e8f9',
        white: '#d4d4d8', brightWhite: '#f4f4f5',
      },
      fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${location.host}/api/terminal`)
    ws.binaryType = 'arraybuffer'

    // Keepalive ping every 25 seconds to prevent idle disconnects
    const keepalive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 25000)

    ws.onopen = () => {
      setStatus('connected')
      ws.send(JSON.stringify({ type: 'resize', rows: term.rows, cols: term.cols }))
    }

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(e.data))
      } else {
        // Ignore pong frames
        try { const msg = JSON.parse(e.data); if (msg.type === 'pong') return } catch {}
        term.write(e.data as string)
      }
    }

    ws.onclose = () => {
      setStatus('disconnected')
      clearInterval(keepalive)
      term.write('\r\n\x1b[2m[session closed — click Connect to start a new session]\x1b[0m\r\n')
    }

    ws.onerror = () => {
      setStatus('error')
      clearInterval(keepalive)
    }

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data }))
      }
    })

    term.onResize(({ rows, cols }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', rows, cols }))
      }
    })

    const ro = new ResizeObserver(() => fitAddon.fit())
    ro.observe(containerRef.current)

    cleanupRef.current = () => {
      clearInterval(keepalive)
      ro.disconnect()
      ws.close()
      term.dispose()
    }
  }, [status])

  const disconnect = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    setStatus('idle')
    if (containerRef.current) containerRef.current.innerHTML = ''
  }, [])

  // Cleanup on unmount
  useEffect(() => () => { cleanupRef.current?.() }, [])

  const isActive = status === 'connected' || status === 'connecting'

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        {/* Status indicator */}
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${
            status === 'connected'    ? 'bg-green-400' :
            status === 'connecting'   ? 'bg-amber-400 animate-pulse' :
            status === 'disconnected' ? 'bg-zinc-500' :
            status === 'error'        ? 'bg-red-400' :
            'bg-zinc-700'
          }`} />
          <span className="text-xs text-zinc-500 font-mono">
            {status === 'connected'    ? 'svc-podman-01' :
             status === 'connecting'   ? 'connecting…' :
             status === 'disconnected' ? 'disconnected' :
             status === 'error'        ? 'connection error' :
             'not connected'}
          </span>
        </div>

        <div className="flex-1" />

        {/* Buttons */}
        {!isActive ? (
          <button
            onClick={connect}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors"
          >
            <span>▶</span> Connect
          </button>
        ) : (
          <button
            onClick={disconnect}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-zinc-700 hover:bg-red-700 text-zinc-200 hover:text-white transition-colors"
          >
            <span>■</span> Disconnect
          </button>
        )}
      </div>

      {/* Terminal pane — always rendered so xterm can mount into it */}
      <div
        ref={containerRef}
        className={`w-full rounded-lg overflow-hidden transition-all ${
          isActive ? 'opacity-100' : 'opacity-0 pointer-events-none h-0'
        }`}
        style={{ height: isActive ? '400px' : '0', background: '#09090b' }}
      />

      {/* Idle placeholder */}
      {status === 'idle' && (
        <div className="flex flex-col items-center justify-center h-24 gap-2 text-zinc-600 text-sm">
          <span className="text-2xl">⌨️</span>
          Click <span className="text-green-400 font-medium">Connect</span> to open a shell on svc-podman-01
        </div>
      )}
    </div>
  )
}
