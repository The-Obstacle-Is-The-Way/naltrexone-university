import { describe, expect, it } from 'vitest';
import config from './playwright.config';

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
});
