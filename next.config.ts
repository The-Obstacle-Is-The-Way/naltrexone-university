import type { NextConfig } from 'next';

const contentSecurityPolicyReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://*.clerk.accounts.dev https://*.clerk.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://*.ingest.sentry.io",
  'frame-src https://js.stripe.com https://hooks.stripe.com https://*.clerk.accounts.dev https://*.clerk.com',
  'upgrade-insecure-requests',
].join('; ');

const nextConfig: NextConfig = {
  cacheComponents: true,
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
          {
            // app/layout.tsx already consumes x-nonce, but next.config headers are static.
            // Keep CSP report-only here; move CSP to request middleware before enforcing nonce-bound script/style directives.
            key: 'Content-Security-Policy-Report-Only',
            value: contentSecurityPolicyReportOnly,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
