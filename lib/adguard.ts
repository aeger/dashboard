export interface AdGuardStats {
  total_dns_queries: number
  blocked_filtering: number
  blocked_percent: number
  top_queried_domains: { name: string; count: number }[]
  top_clients: { name: string; count: number }[]
}

export async function fetchAdGuardStats(configUrl?: string): Promise<AdGuardStats | null> {
  const baseUrl = process.env.ADGUARD_URL || configUrl
  const username = process.env.ADGUARD_USERNAME
  const password = process.env.ADGUARD_PASSWORD

  if (!baseUrl) return null

  try {
    const headers: Record<string, string> = {}
    if (username && password) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
    }

    const res = await fetch(`${baseUrl}/control/stats`, {
      headers,
      next: { revalidate: 60 },
    })

    if (!res.ok) return null

    const data = await res.json()
    const total = data.num_dns_queries ?? 0
    const blocked = data.num_blocked_filtering ?? 0

    return {
      total_dns_queries: total,
      blocked_filtering: blocked,
      blocked_percent: total > 0 ? Math.round((blocked / total) * 100) : 0,
      top_queried_domains: (data.top_queried_domains ?? []).slice(0, 5).map((d: Record<string, number>) => {
        const [name, count] = Object.entries(d)[0]
        return { name, count }
      }),
      top_clients: (data.top_clients ?? []).slice(0, 5).map((c: Record<string, number>) => {
        const [name, count] = Object.entries(c)[0]
        return { name, count }
      }),
    }
  } catch {
    return null
  }
}

