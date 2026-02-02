// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AuthGateway } from '@/src/application/ports/gateways';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('GetStartedCta', () => {
  it('links to /pricing when user is not entitled', async () => {
    const { GetStartedCta } = await import('./get-started-cta');

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

  it('links to /app/dashboard when user is entitled', async () => {
    const { GetStartedCta } = await import('./get-started-cta');

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
});
