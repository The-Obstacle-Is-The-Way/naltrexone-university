// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { parseHtml } from '@/tests/shared/dom-helpers';

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

vi.mock('@/components/providers', () => ({
  Providers: ({
    children,
    nonce,
  }: {
    children: React.ReactNode;
    nonce?: string;
  }) => (
    <div data-testid="providers" data-nonce={nonce}>
      {children}
    </div>
  ),
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({
    children,
    nonce,
    forcedTheme,
    defaultTheme,
  }: {
    children: React.ReactNode;
    nonce?: string;
    forcedTheme?: string;
    defaultTheme?: string;
  }) => (
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

  beforeAll(async () => {
    const module = await import('@/app/layout');
    RootLayout = module.default;
    NonceBoundProviders = module.NonceBoundProviders;
    viewport = module.viewport;
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
