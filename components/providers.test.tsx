// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();

describe('Providers', () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders children when NEXT_PUBLIC_SKIP_CLERK=true even if Clerk import would fail', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    vi.doMock('@clerk/nextjs', () => {
      throw new Error('Publishable key not valid.');
    });

    const { Providers } = await import('@/components/providers');

    const html = renderToStaticMarkup(
      <Providers>
        <div>child</div>
      </Providers>,
    );

    expect(html).toContain('child');
  });

  it('wraps children when NEXT_PUBLIC_SKIP_CLERK is not true', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

    vi.doMock('@clerk/nextjs', () => {
      throw new Error('Publishable key not valid.');
    });
    vi.doMock('next/dynamic', () => ({
      default: () =>
        function MockClerkProvider({ children }: { children: ReactNode }) {
          return <div data-testid="clerk-provider">{children}</div>;
        },
    }));

    const { Providers } = await import('@/components/providers');

    const html = renderToStaticMarkup(
      <Providers>
        <div>child</div>
      </Providers>,
    );

    expect(html).toContain('data-testid="clerk-provider"');
    expect(html).toContain('child');
  });
});
