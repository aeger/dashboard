import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      // Immich photos (update host to match your deployment)
      { protocol: 'http', hostname: 'immich-server', pathname: '/api/assets/**' },
      { protocol: 'http', hostname: '192.168.*', pathname: '/api/assets/**' },
    ],
  },
}

export default nextConfig
