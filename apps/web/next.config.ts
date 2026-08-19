import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@electric-sql/pglite'],
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
}

export default nextConfig
