export interface Monitor {
  id: number
  name: string
  status: 'up' | 'down' | 'pending' | 'maintenance'
  uptime: number
  ping: number | null
}

export async function fetchUptimeKuma(): Promise<Monitor[]> {
  const baseUrl = process.env.UPTIME_KUMA_URL
  if (!baseUrl) return []

  try {
    const res = await fetch(`${baseUrl}/api/status-page/default`, {
      next: { revalidate: 60 },
    })

    if (!res.ok) return []

    const data = await res.json()
    const monitorList: Monitor[] = []

    if (data.publicGroupList) {
      for (const group of data.publicGroupList) {
        for (const monitor of group.monitorList) {
          const lastBeat = monitor.heartBeatList?.[monitor.heartBeatList.length - 1]
          const statusNum: number = lastBeat?.status ?? 2

          let status: Monitor['status'] = 'pending'
          if (statusNum === 1) status = 'up'
          else if (statusNum === 0) status = 'down'
          else if (statusNum === 3) status = 'maintenance'

          monitorList.push({
            id: monitor.id,
            name: monitor.name,
            status,
            uptime: monitor.uptime ?? 0,
            ping: lastBeat?.ping ?? null,
          })
        }
      }
    }

    return monitorList
  } catch {
    return []
  }
}
