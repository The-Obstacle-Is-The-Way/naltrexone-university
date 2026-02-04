import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
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
