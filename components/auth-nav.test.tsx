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

describe('AuthNav', () => {
  afterEach(() => {
    restoreEnv();
    vi.unmock('@clerk/nextjs');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  function mockUserButton() {
    vi.doMock('@clerk/nextjs', () => ({
      UserButton: () => <div data-testid="user-button" />,
    }));
  }

  function createUser(): User {
    return {
      id: 'user_1',
      email: 'user@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };
  }

  it('renders a CI fallback UI when NEXT_PUBLIC_SKIP_CLERK=true', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';

    vi.doMock('@clerk/nextjs', () => {
      throw new Error('Clerk must not be imported when skipClerk=true');
    });

    const { AuthNav } = await import('./auth-nav');

    const element = await AuthNav({ deps: undefined });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/pricing"');
    expect(html).toContain('href="/sign-in"');
    expect(html).not.toContain('data-testid="user-button"');
  });

  it('shows a Dashboard link when the user is entitled', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    mockUserButton();

    const { AuthNav } = await import('./auth-nav');

    const authGateway = new FakeAuthGateway(createUser());

    const calls: CheckEntitlementInput[] = [];
    const checkEntitlementUseCase = {
      execute: async (input: CheckEntitlementInput) => {
        calls.push(input);
        return { isEntitled: true };
      },
    };

    const element = await AuthNav({
      deps: { authGateway, checkEntitlementUseCase },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/app/dashboard"');
    expect(html).toContain('data-testid="user-button"');
    expect(html).not.toContain('href="/pricing"');
    expect(calls).toEqual([{ userId: 'user_1' }]);
  });

  it('renders an unauthenticated UI when there is no current user', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    mockUserButton();

    const { AuthNav } = await import('./auth-nav');

    const authGateway = new FakeAuthGateway(null);

    const calls: CheckEntitlementInput[] = [];
    const checkEntitlementUseCase = {
      execute: async (input: CheckEntitlementInput) => {
        calls.push(input);
        return { isEntitled: true };
      },
    };

    const element = await AuthNav({
      deps: { authGateway, checkEntitlementUseCase },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/pricing"');
    expect(html).toContain('href="/sign-in"');
    expect(html).not.toContain('data-testid="user-button"');
    expect(calls).toHaveLength(0);
  });

  it('shows a Pricing link when the user is not entitled', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    mockUserButton();

    const { AuthNav } = await import('./auth-nav');

    const authGateway = new FakeAuthGateway(createUser());

    const calls: CheckEntitlementInput[] = [];
    const checkEntitlementUseCase = {
      execute: async (input: CheckEntitlementInput) => {
        calls.push(input);
        return { isEntitled: false };
      },
    };

    const element = await AuthNav({
      deps: { authGateway, checkEntitlementUseCase },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/pricing"');
    expect(html).toContain('data-testid="user-button"');
    expect(html).not.toContain('href="/app/dashboard"');
    expect(calls).toEqual([{ userId: 'user_1' }]);
  });

  it('loads dependencies from the container when deps are omitted', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    mockUserButton();

    const { AuthNav } = await import('./auth-nav');

    const element = await AuthNav({
      deps: undefined,
      createContainerFn: () => ({
        createAuthGateway: () => new FakeAuthGateway(createUser()),
        createCheckEntitlementUseCase: () => ({
          execute: async () => ({ isEntitled: true }),
        }),
      }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/app/dashboard"');
    expect(html).toContain('data-testid="user-button"');
  });
});
