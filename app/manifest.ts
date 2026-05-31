import type { MetadataRoute } from 'next'

// PWA web manifest — served at /manifest.webmanifest and auto-linked by Next.
// Icons live in /public (icon-192.png, icon-512.png).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AZ-Lab Home',
    short_name: 'AZ-Lab',
    description: 'Home dashboard',
    start_url: '/',
    display: 'standalone',
    background_color: '#18181b',
    theme_color: '#18181b',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
