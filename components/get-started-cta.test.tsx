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

describe('GetStartedCta', () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('links to /pricing when user is not entitled', async () => {
    const { GetStartedCta } = await import('@/components/get-started-cta');

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

    const element = await GetStartedCta({
      deps: { authGateway, checkEntitlementUseCase },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/pricing"');
    expect(html).toContain('Get Started');
  });

  it('links to /pricing when unauthenticated', async () => {
    const { GetStartedCta } = await import('@/components/get-started-cta');

    const authGateway: AuthGateway = {
      getCurrentUser: vi.fn(async () => null),
      requireUser: vi.fn(async () => {
        throw new Error('not used');
      }),
    };

    const checkEntitlementUseCase = {
      execute: vi.fn(async () => ({ isEntitled: true })),
    };

    const element = await GetStartedCta({
      deps: { authGateway, checkEntitlementUseCase },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/pricing"');
    expect(html).toContain('Get Started');
    expect(checkEntitlementUseCase.execute).not.toHaveBeenCalled();
  });

  it('links to /app/dashboard when user is entitled', async () => {
    const { GetStartedCta } = await import('@/components/get-started-cta');

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

    const element = await GetStartedCta({
      deps: { authGateway, checkEntitlementUseCase },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/app/dashboard"');
    expect(html).toContain('Go to Dashboard');
  });

  it('links to /pricing when NEXT_PUBLIC_SKIP_CLERK=true', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';

    const { GetStartedCta } = await import('@/components/get-started-cta');

    const element = await GetStartedCta({ deps: undefined });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/pricing"');
    expect(html).toContain('Get Started');
  });

  it('loads dependencies from the container when deps are omitted', async () => {
    const { GetStartedCta } = await import('@/components/get-started-cta');

    const element = await GetStartedCta({
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
            execute: async () => ({ isEntitled: false }),
          }),
        }),
      },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/pricing"');
    expect(html).toContain('Get Started');
  });
});
