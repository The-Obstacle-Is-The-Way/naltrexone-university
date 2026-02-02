// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthGateway } from '@/src/application/ports/gateways';

vi.mock('@clerk/nextjs', () => ({
  UserButton: () => <div data-testid="user-button" />,
}));

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
}

describe('AuthNav', () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders a CI fallback UI when NEXT_PUBLIC_SKIP_CLERK=true', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';

    const { AuthNav } = await import('./auth-nav');

    const element = await AuthNav({ deps: undefined });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/pricing"');
    expect(html).toContain('href="/sign-in"');
    expect(html).not.toContain('data-testid="user-button"');
  });

  it('shows a Dashboard link when the user is entitled', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

    const { AuthNav } = await import('./auth-nav');

    const authGateway: AuthGateway = {
      getCurrentUser: vi.fn(async () => ({
        id: 'user_1',
        email: 'user@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      })),
      requireUser: vi.fn(async () => {
        throw new Error('not used');
      }),
    };

    const checkEntitlementUseCase = {
      execute: vi.fn(async () => ({ isEntitled: true })),
    };

    const element = await AuthNav({
      deps: { authGateway, checkEntitlementUseCase },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/app/dashboard"');
    expect(html).toContain('data-testid="user-button"');
    expect(html).not.toContain('href="/pricing"');
  });
});
