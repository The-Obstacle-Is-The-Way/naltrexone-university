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
    expect(html).toContain('data-testid="app-toast-region"');
  });

  it('wraps children when NEXT_PUBLIC_SKIP_CLERK is not true', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

    vi.doMock('@clerk/nextjs', () => {
      throw new Error('Publishable key not valid.');
    });
    vi.doMock('next/dynamic', () => ({
      default: () =>
        function MockClerkProvider({
          children,
          dynamic,
          nonce,
          signInFallbackRedirectUrl,
          signUpFallbackRedirectUrl,
        }: {
          children: ReactNode;
          dynamic?: boolean;
          nonce?: string;
          signInFallbackRedirectUrl?: string;
          signUpFallbackRedirectUrl?: string;
        }) {
          return (
            <div
              data-testid="clerk-provider"
              data-dynamic={dynamic ? 'true' : 'false'}
              data-nonce={nonce}
              data-sign-in-fallback={signInFallbackRedirectUrl}
              data-sign-up-fallback={signUpFallbackRedirectUrl}
            >
              {children}
            </div>
          );
        },
    }));

    const { Providers } = await import('@/components/providers');

    const html = renderToStaticMarkup(
      <Providers nonce="nonce-123">
        <div>child</div>
      </Providers>,
    );

    expect(html).toContain('data-testid="clerk-provider"');
    expect(html).toContain('child');
    expect(html).toContain('data-testid="app-toast-region"');
    expect(html).toContain('data-sign-in-fallback="/app/dashboard"');
    expect(html).toContain('data-sign-up-fallback="/app/dashboard"');
    expect(html).toContain('data-dynamic="true"');
    expect(html).toContain('data-nonce="nonce-123"');
  });

  it('passes Clerk UI appearance variables using current foreground token names', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

    vi.doMock('next-themes', () => ({
      useTheme: () => ({ resolvedTheme: 'dark' }),
    }));
    vi.doMock('@clerk/nextjs', () => {
      throw new Error('Publishable key not valid.');
    });
    vi.doMock('next/dynamic', () => ({
      default: () =>
        function MockClerkProvider({
          appearance,
          children,
        }: {
          appearance?: {
            variables?: Record<string, string | undefined>;
          };
          children: ReactNode;
        }) {
          const variables = appearance?.variables ?? {};

          return (
            <div
              data-testid="clerk-provider"
              data-color-foreground={variables.colorForeground}
              data-color-muted-foreground={variables.colorMutedForeground}
              data-color-text={variables.colorText}
              data-color-text-secondary={variables.colorTextSecondary}
            >
              {children}
            </div>
          );
        },
    }));

    const { Providers } = await import('@/components/providers');

    const html = renderToStaticMarkup(
      <Providers>
        <div>child</div>
      </Providers>,
    );

    expect(html).toContain('data-color-foreground="#ededed"');
    expect(html).toContain('data-color-muted-foreground="#737373"');
    expect(html).not.toContain('data-color-text=');
    expect(html).not.toContain('data-color-text-secondary=');
  });
});
