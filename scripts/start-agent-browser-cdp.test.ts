import { describe, expect, it } from 'vitest';
import {
  formatAgentBrowserCdpInstructions,
  resolveAgentBrowserCdpConfig,
} from './start-agent-browser-cdp';

const VALID_ENV = {
  E2E_CLERK_USER_USERNAME: 'e2e@example.com',
  E2E_CLERK_USER_PASSWORD: 'super-secret',
  CLERK_SECRET_KEY: 'sk_test_123',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_123',
} satisfies Record<string, string | undefined>;

describe('resolveAgentBrowserCdpConfig', () => {
  it('throws when E2E_CLERK_USER_USERNAME is missing', () => {
    expect(() =>
      resolveAgentBrowserCdpConfig({
        ...VALID_ENV,
        E2E_CLERK_USER_USERNAME: undefined,
      }),
    ).toThrow('E2E_CLERK_USER_USERNAME is missing.');
  });

  it('throws when E2E_CLERK_USER_PASSWORD is missing', () => {
    expect(() =>
      resolveAgentBrowserCdpConfig({
        ...VALID_ENV,
        E2E_CLERK_USER_PASSWORD: undefined,
      }),
    ).toThrow('E2E_CLERK_USER_PASSWORD is missing.');
  });

  it('throws when CLERK_SECRET_KEY is missing', () => {
    expect(() =>
      resolveAgentBrowserCdpConfig({
        ...VALID_ENV,
        CLERK_SECRET_KEY: undefined,
      }),
    ).toThrow('CLERK_SECRET_KEY is missing.');
  });

  it('throws when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing', () => {
    expect(() =>
      resolveAgentBrowserCdpConfig({
        ...VALID_ENV,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: undefined,
      }),
    ).toThrow('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing.');
  });

  it('returns validated config when all required env vars are present', () => {
    const config = resolveAgentBrowserCdpConfig(VALID_ENV);

    expect(config).toMatchObject({
      username: 'e2e@example.com',
      password: 'super-secret',
      clerkSecretKey: 'sk_test_123',
      clerkPublishableKey: 'pk_test_123',
      baseURL: 'http://localhost:3000',
      cdpPort: 9224,
      dashboardUrl: 'http://localhost:3000/app/dashboard',
    });
  });

  it('uses port 9224 when AGENT_BROWSER_CDP_PORT is not set', () => {
    const config = resolveAgentBrowserCdpConfig(VALID_ENV);

    expect(config.cdpPort).toBe(9224);
  });

  it('uses a custom AGENT_BROWSER_CDP_PORT when provided', () => {
    const config = resolveAgentBrowserCdpConfig({
      ...VALID_ENV,
      AGENT_BROWSER_CDP_PORT: '9333',
    });

    expect(config.cdpPort).toBe(9333);
  });

  it('throws when AGENT_BROWSER_CDP_PORT is invalid', () => {
    expect(() =>
      resolveAgentBrowserCdpConfig({
        ...VALID_ENV,
        AGENT_BROWSER_CDP_PORT: 'not-a-number',
      }),
    ).toThrow('AGENT_BROWSER_CDP_PORT must be a positive integer.');
  });

  it('uses http://localhost:3000 when NEXT_PUBLIC_APP_URL is not set', () => {
    const config = resolveAgentBrowserCdpConfig({
      ...VALID_ENV,
      NEXT_PUBLIC_APP_URL: undefined,
    });

    expect(config.baseURL).toBe('http://localhost:3000');
    expect(config.dashboardUrl).toBe('http://localhost:3000/app/dashboard');
  });

  it('uses NEXT_PUBLIC_APP_URL when provided', () => {
    const config = resolveAgentBrowserCdpConfig({
      ...VALID_ENV,
      NEXT_PUBLIC_APP_URL: 'http://localhost:4000',
    });

    expect(config.baseURL).toBe('http://localhost:4000');
    expect(config.dashboardUrl).toBe('http://localhost:4000/app/dashboard');
  });
});

describe('formatAgentBrowserCdpInstructions', () => {
  it('includes the CDP port, authenticated URL, and connect command', () => {
    const instructions = formatAgentBrowserCdpInstructions({
      cdpPort: 9224,
      authenticatedUrl: 'http://localhost:3000/app/dashboard',
      practiceUrl: 'http://localhost:3000/app/practice',
    });

    expect(instructions).toContain('CDP port: 9224');
    expect(instructions).toContain(
      'Authenticated URL: http://localhost:3000/app/dashboard',
    );
    expect(instructions).toContain('agent-browser connect 9224');
    expect(instructions).toContain(
      'agent-browser open http://localhost:3000/app/practice',
    );
  });
});
