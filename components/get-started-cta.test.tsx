// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
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
let GetStartedCta: typeof import('./get-started-cta').GetStartedCta;
beforeAll(async () => {
  ({ GetStartedCta } = await import('./get-started-cta'));
});

describe('GetStartedCta', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
  });

  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.restoreAllMocks();
  });

  it('links to /pricing when user is not entitled', async () => {
    const authGateway = new FakeAuthGateway(createUser());
    const checkEntitlementUseCase = new FakeCheckEntitlementUseCase({
      isEntitled: false,
    });

    const element = await GetStartedCta({
      deps: { authGateway, checkEntitlementUseCase },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-slot="button"');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('a')?.classList.contains('h-auto')).toBe(true);
    expect(html).toContain('href="/pricing"');
    expect(html).toContain('Get started');
  });

  it('links to /pricing when unauthenticated', async () => {
    const authGateway = new FakeAuthGateway(null);
    const checkEntitlementUseCase = new FakeCheckEntitlementUseCase({
      isEntitled: true,
    });

    const element = await GetStartedCta({
      deps: { authGateway, checkEntitlementUseCase },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-slot="button"');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('a')?.classList.contains('h-auto')).toBe(true);
    expect(html).toContain('href="/pricing"');
    expect(html).toContain('Get started');
    expect(checkEntitlementUseCase.inputs).toHaveLength(0);
  });

  it('links to /app/dashboard when user is entitled', async () => {
    const authGateway = new FakeAuthGateway(createUser());
    const checkEntitlementUseCase = new FakeCheckEntitlementUseCase({
      isEntitled: true,
    });

    const element = await GetStartedCta({
      deps: { authGateway, checkEntitlementUseCase },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-slot="button"');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('a')?.classList.contains('h-auto')).toBe(true);
    expect(html).toContain('href="/app/dashboard"');
    expect(html).toContain('Go to dashboard');
  });

  it('links to /pricing when NEXT_PUBLIC_SKIP_CLERK=true', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';

    const element = await GetStartedCta({ deps: undefined });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-slot="button"');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('a')?.classList.contains('h-auto')).toBe(true);
    expect(html).toContain('href="/pricing"');
    expect(html).toContain('Get started');
  });

  it('loads dependencies from the container when deps are omitted', async () => {
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
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('a')?.classList.contains('h-auto')).toBe(true);
    expect(html).toContain('href="/pricing"');
    expect(html).toContain('Get started');
  });
});
