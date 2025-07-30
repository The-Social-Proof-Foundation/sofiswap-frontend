/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  // Ensure API routes work properly in production
  serverExternalPackages: ['resend'],
};

module.exports = nextConfig;