// @vitest-environment jsdom
import type { ThemeProviderProps } from 'next-themes';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseHtml } from '@/tests/shared/dom-helpers';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();
type ClerkProviderProps = ComponentProps<
  typeof import('@clerk/nextjs').ClerkProvider
>;

afterAll(() => {
  restoreProcessEnv(ORIGINAL_ENV);
});

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-nonce': 'nonce-123' }),
}));

vi.mock('next/font/google', () => ({
  Instrument_Sans: () => ({
    className: 'instrument-sans',
    variable: '--font-instrument-sans',
  }),
  Manrope: () => ({
    className: 'manrope',
    variable: '--font-manrope',
  }),
  Plus_Jakarta_Sans: () => ({
    className: 'plus-jakarta-sans',
    variable: '--font-plus-jakarta-sans',
  }),
}));

// Keep both application wrappers real; observe only their vendor-boundary props.
// This does not claim to simulate Clerk authentication or next-themes behavior.
vi.mock('next/dynamic', () => ({
  default: () =>
    function ClerkProviderBoundary({ children, nonce }: ClerkProviderProps) {
      return (
        <div data-testid="providers" data-nonce={nonce}>
          {children}
        </div>
      );
    },
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark', forcedTheme: 'dark' }),
  ThemeProvider: ({
    children,
    nonce,
    forcedTheme,
    defaultTheme,
  }: ThemeProviderProps) => (
    <div
      data-testid="theme-provider"
      data-nonce={nonce}
      data-forced-theme={forcedTheme}
      data-default-theme={defaultTheme}
    >
      {children}
    </div>
  ),
}));

describe('app/layout', () => {
  let RootLayout: typeof import('@/app/layout').default;
  let NonceBoundProviders: typeof import('@/app/layout').NonceBoundProviders;
  let viewport: typeof import('@/app/layout').viewport;
  let metadata: typeof import('@/app/layout').metadata;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    const module = await import('@/app/layout');
    RootLayout = module.default;
    NonceBoundProviders = module.NonceBoundProviders;
    viewport = module.viewport;
    metadata = module.metadata;
  });

  it('resolves public metadata against the canonical production apex', () => {
    expect(metadata.metadataBase?.toString()).toBe(
      'https://addictionboards.com/',
    );
  });

  it('does not impose a root canonical on auth or private pages', () => {
    expect(metadata.alternates?.canonical).toBeUndefined();
  });

  it('adds data-scroll-behavior on the html element', () => {
    const html = renderToStaticMarkup(
      RootLayout({
        children: <div>Child content</div>,
      }),
    );

    expect(html).toContain('data-scroll-behavior="smooth"');
    expect(html).toContain('Skip to content');
    expect(html).toContain('Child content');
  });

  it('ships the forced dark theme on the root html element', () => {
    const html = renderToStaticMarkup(
      RootLayout({
        children: <main id="main-content">Route content</main>,
      }),
    );
    const doc = parseHtml(html);
    const htmlElement = doc.documentElement;

    expect(htmlElement.classList.contains('dark')).toBe(true);
    expect(htmlElement.style.colorScheme).toBe('dark');
  });

  it('keeps the suspense fallback free of nonce-sensitive providers', () => {
    const html = renderToStaticMarkup(
      RootLayout({
        children: <div>Child content</div>,
      }),
    );

    expect(html).not.toContain('data-testid="theme-provider"');
    expect(html).not.toContain('data-testid="providers"');
  });

  it('passes the request nonce through the nonce-bound provider shell', async () => {
    const html = renderToStaticMarkup(
      await NonceBoundProviders({
        children: <div>Child content</div>,
      }),
    );

    expect(html).toContain('data-nonce="nonce-123"');
    const doc = parseHtml(html);
    expect(
      doc
        .querySelector('[data-testid="theme-provider"]')
        ?.getAttribute('data-nonce'),
    ).toBe('nonce-123');
    expect(
      doc
        .querySelector('[data-testid="providers"]')
        ?.getAttribute('data-nonce'),
    ).toBe('nonce-123');
  });

  it('pins the app to dark mode via forcedTheme (light mode disabled — DEBT-421)', async () => {
    const html = renderToStaticMarkup(
      await NonceBoundProviders({
        children: <div>Child content</div>,
      }),
    );

    expect(html).toContain('data-forced-theme="dark"');
    expect(html).toContain('data-default-theme="dark"');
  });

  it('sets dark-only browser chrome metadata while forced dark is active', () => {
    expect(viewport.themeColor).toBe('#090909');
  });

  it('does not nest a root main landmark around route-level content', () => {
    const html = renderToStaticMarkup(
      RootLayout({
        children: <main id="main-content">Route content</main>,
      }),
    );
    const doc = parseHtml(html);

    expect(doc.querySelectorAll('main')).toHaveLength(1);
  });
});
