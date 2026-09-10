/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  serverExternalPackages: ['resend'],
  experimental: {
    // Avoid incomplete app-path manifests observed when the webpack build worker
    // runs under the local Node toolchain; a single-process build is deterministic.
    webpackBuildWorker: false,
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  /**
   * OAuth popups (e.g. @socialproof/mysocial-auth) read `popup.closed` from the opener.
   * `COOP: same-origin` breaks that; `same-origin-allow-popups` keeps popups usable.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig
