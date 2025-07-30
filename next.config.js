/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  async headers() {
    return [
      {
        // Apply CORS headers to API routes
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ]
  },
  // Ensure API routes work properly in production
  serverExternalPackages: ['resend'],
  // Webpack configuration to fix module loading issues
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Fix for __webpack_modules__ issues
    config.optimization = {
      ...config.optimization,
      moduleIds: 'deterministic',
    }
    
    // Ensure proper module resolution
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    }
    
    return config
  }
};

module.exports = nextConfig;