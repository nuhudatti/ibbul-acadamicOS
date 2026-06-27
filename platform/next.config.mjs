/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['localhost'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.amazonaws.com',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    return [
      // ── Django backend passthrough (internal use) ──────────────────────────
      {
        source: '/api/backend/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/:path*`,
      },

      // ── Results System (IBBUL Result Checker — Vite app on port 5173) ──────
      // Proxied at /results-app/* so it shares the same origin (port 3000)
      // with the platform — localStorage (access_token) is automatically shared.
      {
        source: '/results-app',
        destination: 'http://localhost:5173/results-app',
      },
      {
        source: '/results-app/:path*',
        destination: 'http://localhost:5173/results-app/:path*',
      },

      // ── Learning System (Virtual Learning System — Next.js on port 3001) ───
      // basePath='/learning-app' is set in VLS's next.config.js.
      {
        source: '/learning-app',
        destination: 'http://localhost:3001/learning-app',
      },
      {
        source: '/learning-app/:path*',
        destination: 'http://localhost:3001/learning-app/:path*',
      },
    ]
  },
}

export default nextConfig
