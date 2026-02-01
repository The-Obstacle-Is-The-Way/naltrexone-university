import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'db/migrations', 'tests/integration/**'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
    // Isolate test files that use vi.mock() for module-level imports
    // to prevent module caching issues across test files
    isolate: true,
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
