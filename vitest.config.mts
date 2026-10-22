import path from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';
import { RuleProofReporter } from './tests/rule-proof-reporter.mts';

(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

export default defineConfig({
  test: {
    reporters: [...configDefaults.reporters, new RuleProofReporter('unit')],
    allowOnly: false,
    includeTaskLocation: true,
    globals: true,
    environment: 'node',
    testTimeout: 10_000,
    hookTimeout: 15_000,
    env: {
      NODE_ENV: 'test',
    },
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'db/migrations', 'tests/integration/**'],
    setupFiles: ['./vitest.setup.ts', './vitest.unit.setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './'),
    },
  },
});
