import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    // Pin build-time type checking to the TypeScript compiler API, not the CLI.
    // Next 16.3.0 flipped this default false -> true; in CLI mode Next requires
    // a `typescript/bin/tsc` file, but this repo's DEBT-460 dual-compiler seam
    // aliases `typescript` -> `@typescript/typescript6`, whose bin is renamed
    // `tsc6` precisely so it does not claim `tsc`. CLI mode therefore reports
    // `typescript` as missing and fails the build. API mode resolves
    // `typescript/lib/typescript.js`, which the shim does ship.
    // Do not remove until a released Next version supports this alias topology
    // or the seam is collapsed (see DEBT-460).
    useTypeScriptCli: false,
  },
  // Playwright uses 127.0.0.1 by default while Next dev server initializes on
  // localhost; allow both to avoid cross-origin dev warnings and future blocks.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // Expose Vercel runtime environment to the browser bundle so client-side
  // Sentry config can tag preview deployments correctly.
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? '',
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
