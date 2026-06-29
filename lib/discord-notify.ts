// Server-side Discord notification helper — no auth cookie required
// Used internally by API routes when tasks enter pending_jeff_action / review_needed

const DISCORD_API = 'https://discord.com/api/v10'

/**
 * Post automated/system content under the "Dashboard" webhook identity so it's
 * visually distinct from Wren's conversational (bot-token) replies. Falls back to
 * the bot API if no webhook is configured, so delivery still happens.
 * Returns { ok, id } — id only when wait:true (webhook) or via the bot API.
 */
export async function postViaDashboard(
  payload: { content?: string; embeds?: unknown[] },
  opts?: { username?: string; wait?: boolean },
): Promise<{ ok: boolean; id?: string }> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  if (webhookUrl) {
    try {
      const url = opts?.wait ? `${webhookUrl}?wait=true` : webhookUrl
      const body = opts?.username ? { username: opts.username, ...payload } : payload
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) return { ok: false }
      if (opts?.wait) {
        const msg = await res.json().catch(() => null)
        return { ok: true, id: msg?.id }
      }
      return { ok: true } // 204 No Content
    } catch {
      return { ok: false }
    }
  }

  // Fallback: bot API (posts as the bot/Wren identity — not ideal, but delivers)
  const token = process.env.DISCORD_BOT_TOKEN
  const channelId = process.env.DISCORD_CHANNEL_ID
  if (!token || !channelId) return { ok: false }
  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return { ok: false }
    const msg = await res.json().catch(() => null)
    return { ok: true, id: msg?.id }
  } catch {
    return { ok: false }
  }
}

export interface JeffNotifyOpts {
  title: string
  taskId: string
  status: 'pending_jeff_action' | 'review_needed'
  contextSummary?: string | null
  actionRequired?: string | null
}

const STATUS_LABEL: Record<string, string> = {
  pending_jeff_action: '🔔 Action Required',
  review_needed: '👁️ Review Needed',
}

const NOTIFY_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes
const recentNotifications = new Map<string, number>()

export async function notifyJeff(opts: JeffNotifyOpts): Promise<void> {
  // Need either the webhook (preferred) or the bot token to deliver
  if (!process.env.DISCORD_WEBHOOK_URL && (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_CHANNEL_ID)) return

  // Rate-limit: skip if same task was notified in the last 5 minutes
  const now = Date.now()
  const lastNotified = recentNotifications.get(opts.taskId)
  if (lastNotified && now - lastNotified < NOTIFY_COOLDOWN_MS) return
  recentNotifications.set(opts.taskId, now)

  // Clean up old entries
  for (const [id, ts] of recentNotifications) {
    if (now - ts > NOTIFY_COOLDOWN_MS * 2) recentNotifications.delete(id)
  }

  const label = STATUS_LABEL[opts.status] ?? '🔔 Attention'
  const shortId = opts.taskId.slice(0, 8)

  const lines = [
    `**${label}** — \`${opts.status.replace(/_/g, ' ')}\``,
    `**Task:** ${opts.title}`,
    `**ID:** \`${shortId}...\``,
  ]
  if (opts.contextSummary) lines.push(`**Summary:** ${opts.contextSummary}`)
  if (opts.actionRequired) lines.push(`**Action:** ${opts.actionRequired}`)
  lines.push('— via JeffLoop dashboard · home.az-lab.dev')

  const content = lines.join('\n')

  // Best-effort — never throw. Posts as "Dashboard · JeffLoop" via the webhook.
  await postViaDashboard({ content }, { username: 'Dashboard · JeffLoop' })
}
