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

export async function GET() {
  const host = process.env.RUSTDESK_HOST
  const key = process.env.RUSTDESK_KEY ?? ''

  if (!host) {
    return NextResponse.json({ configured: false })
  }

  const [hbbs, hbbr] = await Promise.all([
    tcpProbe(host, 21116),
    tcpProbe(host, 21117),
  ])

  return NextResponse.json({ configured: true, hbbs, hbbr, host, key })
}
