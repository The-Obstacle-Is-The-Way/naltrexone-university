import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Playwright uses 127.0.0.1 by default while Next dev server initializes on
  // localhost; allow both to avoid cross-origin dev warnings and future blocks.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

export default nextConfig;
