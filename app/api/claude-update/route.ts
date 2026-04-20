import { NextResponse } from 'next/server'
import { sshExec } from '@/lib/ssh-exec'

export async function POST() {
  try {
    await sshExec(
      '/home/almty1/.bun/bin/bun add -g @anthropic-ai/claude-code 2>&1 && ' +
      'node /home/almty1/.bun/install/global/node_modules/@anthropic-ai/claude-code/install.cjs 2>&1',
      120_000
    )
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
