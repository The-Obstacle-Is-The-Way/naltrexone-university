import { afterEach, describe, expect, it, vi } from 'vitest';
import config from './playwright.config';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('playwright config', () => {
  it('uses production server mode for e2e webServer', () => {
    const webServer = config.webServer;
    expect(webServer).toBeDefined();
    expect(Array.isArray(webServer)).toBe(false);

    if (!webServer || Array.isArray(webServer)) {
      throw new Error('Expected a single Playwright webServer config object.');
    }

    const expectedCommand = process.env.CI
      ? 'pnpm start'
      : 'pnpm build && pnpm start';
    expect(webServer.command).toBe(expectedCommand);
    expect(webServer.reuseExistingServer).toBe(false);
    expect(webServer.url).toContain('/api/health');
  });

  it('keeps one local retry as an ergonomics buffer after reset errors are diagnosable', async () => {
    vi.stubEnv('CI', '');
    vi.resetModules();

    const localConfig = (await import('./playwright.config')).default;

    expect(localConfig.retries).toBe(1);
  });
});
