import { setDefaultResultOrder } from 'node:dns';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Vitest Browser opens Chromium against a localhost Vite server. Prefer IPv4 so
// environments with a broken ::1 loopback do not hang before tests import.
setDefaultResultOrder('ipv4first');

(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      '@clerk/nextjs/server',
      '@noble/hashes/sha2.js',
      '@noble/hashes/utils.js',
      '@sentry/nextjs',
      'drizzle-orm',
      'drizzle-orm/pg-core',
      'drizzle-orm/postgres-js',
      'pino',
      'postgres',
      'resend',
      'server-only',
      'stripe',
      'zod',
    ],
  },
  test: {
    testTimeout: 15_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
    },
    setupFiles: ['./vitest.setup.ts', './vitest.browser.setup.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
    include: ['**/*.browser.spec.tsx'],
    coverage: {
      reporter: ['json'],
      reportsDirectory: './coverage/browser',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './'),
    },
  },
});
