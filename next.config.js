/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      // Immich photos (update host to match your deployment)
      { protocol: 'http', hostname: 'immich-server', pathname: '/api/assets/**' },
      { protocol: 'http', hostname: '192.168.*', pathname: '/api/assets/**' },
    ],
  },
}

module.exports = nextConfig
