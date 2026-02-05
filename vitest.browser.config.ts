import path from 'node:path';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['server-only'],
  },
  test: {
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
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
