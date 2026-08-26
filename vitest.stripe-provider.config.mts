import path from 'node:path';
import { defineConfig } from 'vitest/config';

(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    testTimeout: 10_000,
    hookTimeout: 15_000,
    env: {
      NODE_ENV: 'test',
    },
    include: [
      'tests/integration/stripe-checkout-client-contract.integration.test.ts',
      'tests/integration/stripe-trial-clock-smoke.integration.test.ts',
    ],
    exclude: ['node_modules', '.next', 'db/migrations'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './'),
    },
  },
});
