// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeAuthGateway } from '@/src/application/test-helpers/fakes';
import type { CheckEntitlementInput } from '@/src/application/use-cases/check-entitlement';
import type { User } from '@/src/domain/entities';

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

describe('GetStartedCta', () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  function createUser(): User {
    return {
      id: 'user_1',
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };
  }

  it('links to /pricing when user is not entitled', async () => {
    const { GetStartedCta } = await import('@/components/get-started-cta');

    const authGateway = new FakeAuthGateway(createUser());

    const calls: CheckEntitlementInput[] = [];
    const checkEntitlementUseCase = {
      execute: async (input: CheckEntitlementInput) => {
        calls.push(input);
        return { isEntitled: false };
      },
    };

    const element = await GetStartedCta({
      deps: { authGateway, checkEntitlementUseCase },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/pricing"');
    expect(html).toContain('Get Started');
    expect(calls).toEqual([{ userId: 'user_1' }]);
  });

  it('links to /pricing when unauthenticated', async () => {
    const { GetStartedCta } = await import('@/components/get-started-cta');

    const authGateway = new FakeAuthGateway(null);

    const calls: CheckEntitlementInput[] = [];
    const checkEntitlementUseCase = {
      execute: async (input: CheckEntitlementInput) => {
        calls.push(input);
        return { isEntitled: true };
      },
    };

    const element = await GetStartedCta({
      deps: { authGateway, checkEntitlementUseCase },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/pricing"');
    expect(html).toContain('Get Started');
    expect(calls).toHaveLength(0);
  });

  it('links to /app/dashboard when user is entitled', async () => {
    const { GetStartedCta } = await import('@/components/get-started-cta');

    const authGateway = new FakeAuthGateway(createUser());

    const calls: CheckEntitlementInput[] = [];
    const checkEntitlementUseCase = {
      execute: async (input: CheckEntitlementInput) => {
        calls.push(input);
        return { isEntitled: true };
      },
    };

    const element = await GetStartedCta({
      deps: { authGateway, checkEntitlementUseCase },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/app/dashboard"');
    expect(html).toContain('Go to Dashboard');
    expect(calls).toEqual([{ userId: 'user_1' }]);
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
      deps: undefined,
      createContainerFn: () => ({
        createAuthGateway: () => new FakeAuthGateway(createUser()),
        createCheckEntitlementUseCase: () => ({
          execute: async () => ({ isEntitled: false }),
        }),
      }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/pricing"');
    expect(html).toContain('Get Started');
  });
});
