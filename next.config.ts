import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Playwright uses 127.0.0.1 by default for NEXT_PUBLIC_APP_URL/baseURL.
  // Next warns today and will block cross-origin /_next/* requests in a future major
  // unless we explicitly allow this dev origin.
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
