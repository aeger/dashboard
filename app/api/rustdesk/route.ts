import { NextResponse } from 'next/server'
import net from 'net'

async function tcpProbe(host: string, port: number, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(timeoutMs)
    socket.on('connect', () => { socket.destroy(); resolve(true) })
    socket.on('timeout', () => { socket.destroy(); resolve(false) })
    socket.on('error', () => resolve(false))
    socket.connect(port, host)
  })
}

// Status only. The relay key is deliberately NOT returned — the widget never
// used it and this route is reachable by any LAN client.
export async function GET() {
  const host = process.env.RUSTDESK_HOST

  if (!host) {
    return NextResponse.json({ configured: false })
  }

  const [hbbs, hbbr] = await Promise.all([
    tcpProbe(host, 21116),
    tcpProbe(host, 21117),
  ])

  return NextResponse.json({ configured: true, hbbs, hbbr, host })
}
