// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeAuthGateway } from '@/src/application/test-helpers/fakes/fake-gateways';
import { FakeCheckEntitlementUseCase } from '@/src/application/test-helpers/fakes/fake-use-cases';
import { createUser } from '@/src/domain/test-helpers/factories';
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

    const authGateway = new FakeAuthGateway(createUser());
    const checkEntitlementUseCase = new FakeCheckEntitlementUseCase({
      isEntitled: false,
    });

    const element = await GetStartedCta({
      deps: { authGateway, checkEntitlementUseCase },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-slot="button"');
    expect(html).toContain('href="/pricing"');
    expect(html).toContain('Get Started');
  });

  it('links to /pricing when unauthenticated', async () => {
    const { GetStartedCta } = await import('@/components/get-started-cta');

    const authGateway = new FakeAuthGateway(null);
    const checkEntitlementUseCase = new FakeCheckEntitlementUseCase({
      isEntitled: true,
    });

    const element = await GetStartedCta({
      deps: { authGateway, checkEntitlementUseCase },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-slot="button"');
    expect(html).toContain('href="/pricing"');
    expect(html).toContain('Get Started');
    expect(checkEntitlementUseCase.inputs).toHaveLength(0);
  });

  it('links to /app/dashboard when user is entitled', async () => {
    const { GetStartedCta } = await import('@/components/get-started-cta');

    const authGateway = new FakeAuthGateway(createUser());
    const checkEntitlementUseCase = new FakeCheckEntitlementUseCase({
      isEntitled: true,
    });

    const element = await GetStartedCta({
      deps: { authGateway, checkEntitlementUseCase },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-slot="button"');
    expect(html).toContain('href="/app/dashboard"');
    expect(html).toContain('Go to Dashboard');
  });

  it('links to /pricing when NEXT_PUBLIC_SKIP_CLERK=true', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';

    const { GetStartedCta } = await import('@/components/get-started-cta');

    const element = await GetStartedCta({ deps: undefined });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-slot="button"');
    expect(html).toContain('href="/pricing"');
    expect(html).toContain('Get Started');
  });

  it('loads dependencies from the container when deps are omitted', async () => {
    const { GetStartedCta } = await import('@/components/get-started-cta');

    const element = await GetStartedCta({
      options: {
        loadContainer: async () => ({
          createAuthGateway: () => new FakeAuthGateway(createUser()),
          createCheckEntitlementUseCase: () =>
            new FakeCheckEntitlementUseCase({ isEntitled: false }),
        }),
      },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-slot="button"');
    expect(html).toContain('href="/pricing"');
    expect(html).toContain('Get Started');
  });
});
