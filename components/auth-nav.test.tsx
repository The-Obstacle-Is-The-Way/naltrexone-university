// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthGateway } from '@/src/application/ports/gateways';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

const ORIGINAL_ENV = snapshotProcessEnv();

describe('AuthNav', () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders a CI fallback UI when NEXT_PUBLIC_SKIP_CLERK=true', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    vi.doMock('@clerk/nextjs', () => {
      throw new Error('Publishable key not valid.');
    });

    const { AuthNav } = await import('./auth-nav');

    const element = await AuthNav({ deps: undefined });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/pricing"');
    expect(html).toContain('href="/sign-in"');
    expect(html).toContain(
      'text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
    );
    expect(html).not.toContain('data-testid="user-button"');
  });

  it('shows a Dashboard link when the user is entitled', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    vi.doMock('@clerk/nextjs', () => ({
      UserButton: () => <div data-testid="user-button" />,
    }));

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
    expect(html).toContain(
      'text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
    );
    expect(html).toContain('data-testid="user-button"');
    expect(html).not.toContain('href="/pricing"');
  });

  it('renders an unauthenticated UI when there is no current user', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    vi.doMock('@clerk/nextjs', () => ({
      UserButton: () => <div data-testid="user-button" />,
    }));

    const { AuthNav } = await import('./auth-nav');

    const authGateway: AuthGateway = {
      getCurrentUser: vi.fn(async () => null),
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

    expect(html).toContain('href="/pricing"');
    expect(html).toContain('href="/sign-in"');
    expect(html).not.toContain('data-testid="user-button"');
    expect(checkEntitlementUseCase.execute).not.toHaveBeenCalled();
  });

  it('shows a Pricing link when the user is not entitled', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    vi.doMock('@clerk/nextjs', () => ({
      UserButton: () => <div data-testid="user-button" />,
    }));

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
      execute: vi.fn(async () => ({ isEntitled: false })),
    };

    const element = await AuthNav({
      deps: { authGateway, checkEntitlementUseCase },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/pricing"');
    expect(html).toContain('data-testid="user-button"');
    expect(html).not.toContain('href="/app/dashboard"');
  });

  it('loads dependencies from the container when deps are omitted', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    vi.doMock('@clerk/nextjs', () => ({
      UserButton: () => <div data-testid="user-button" />,
    }));

    const { AuthNav } = await import('./auth-nav');

    const element = await AuthNav({
      options: {
        loadContainer: async () => ({
          createAuthGateway: () => ({
            getCurrentUser: async () => ({
              id: 'user_1',
              email: 'user@example.com',
              createdAt: new Date('2026-02-01T00:00:00Z'),
              updatedAt: new Date('2026-02-01T00:00:00Z'),
            }),
            requireUser: async () => {
              throw new Error('not used');
            },
          }),
          createCheckEntitlementUseCase: () => ({
            execute: async () => ({ isEntitled: true }),
          }),
        }),
      },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/app/dashboard"');
    expect(html).toContain('data-testid="user-button"');
  });
});
