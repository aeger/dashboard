export interface ImmichPhoto {
  id: string
  url: string
}

export async function fetchRandomPhotos(count = 20): Promise<ImmichPhoto[]> {
  const baseUrl = process.env.IMMICH_URL
  const apiKey = process.env.IMMICH_API_KEY

  if (!baseUrl || !apiKey) return []

  try {
    const res = await fetch(`${baseUrl}/api/assets/random?count=${count}&type=IMAGE`, {
      headers: { 'x-api-key': apiKey },
      next: { revalidate: 300 },
    })

    if (!res.ok) return []

    const assets = await res.json()

    return (assets as { id: string }[]).map((asset) => ({
      id: asset.id,
      url: `${baseUrl}/api/assets/${asset.id}/thumbnail?size=preview`,
    }))
  } catch {
    return []
  }
}
