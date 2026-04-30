import { NextRequest, NextResponse } from 'next/server'
import { sshExec } from '@/lib/ssh-exec'

export async function POST(req: NextRequest) {
  const cookie = req.headers.get('cookie') || ''
  if (!cookie.includes('authelia_session')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const output = await sshExec(
      'python3 /home/almty1/claude/tools/infra/security_scan.py',
      90_000
    )
    return NextResponse.json({ success: true, output })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Scan failed: ${msg}` }, { status: 500 })
  }
}
