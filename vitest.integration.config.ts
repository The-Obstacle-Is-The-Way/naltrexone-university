import path from 'node:path';
import { defineConfig } from 'vitest/config';

(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Integration suites share a single mutable Postgres database.
    // Running files in parallel introduces cross-file read/write races
    // (for example, taxonomy census reading rows while repository tests
    // are inserting temporary tags).
    fileParallelism: false,
    testTimeout: 10_000,
    hookTimeout: 15_000,
    env: {
      NODE_ENV: 'test',
    },
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'db/migrations'],
    setupFiles: ['./tests/integration/setup.ts'],
    coverage: {
      reporter: ['json'],
      reportsDirectory: 'coverage/integration',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
