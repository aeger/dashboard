export interface Container {
  id: string
  name: string
  image: string
  state: string
  status: string
  endpoint: string
}

export async function fetchContainers(): Promise<Container[]> {
  const baseUrl = process.env.PORTAINER_URL
  const apiKey = process.env.PORTAINER_API_KEY

  if (!baseUrl || !apiKey) return []

  try {
    // Get endpoints first
    const endpointsRes = await fetch(`${baseUrl}/api/endpoints`, {
      headers: { 'X-API-Key': apiKey },
      next: { revalidate: 60 },
    })

    if (!endpointsRes.ok) return []

    const endpoints = await endpointsRes.json()
    const containers: Container[] = []

    for (const endpoint of endpoints.slice(0, 5)) {
      try {
        const res = await fetch(`${baseUrl}/api/endpoints/${endpoint.Id}/docker/containers/json?all=false`, {
          headers: { 'X-API-Key': apiKey },
          next: { revalidate: 60 },
        })

        if (!res.ok) continue

        const data = await res.json()
        for (const c of data) {
          containers.push({
            id: c.Id.slice(0, 12),
            name: (c.Names?.[0] ?? '').replace(/^\//, ''),
            image: c.Image,
            state: c.State,
            status: c.Status,
            endpoint: endpoint.Name,
          })
        }
      } catch {
        // Skip failed endpoints
      }
    }

    return containers
  } catch {
    return []
  }
}
