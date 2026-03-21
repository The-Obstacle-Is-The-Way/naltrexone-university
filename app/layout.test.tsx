// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

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
  }: {
    children: React.ReactNode;
    nonce?: string;
  }) => (
    <div data-testid="theme-provider" data-nonce={nonce}>
      {children}
    </div>
  ),
}));

describe('app/layout', () => {
  it('adds data-scroll-behavior on the html element', async () => {
    const RootLayout = (await import('@/app/layout')).default;

    const html = renderToStaticMarkup(
      await RootLayout({
        children: <div>Child content</div>,
      }),
    );

    expect(html).toContain('data-scroll-behavior="smooth"');
    expect(html).toContain('data-testid="theme-provider"');
    expect(html).toContain('data-testid="providers"');
    expect(html).toContain('data-nonce="nonce-123"');
  });

  it('does not nest a root main landmark around route-level content', async () => {
    const RootLayout = (await import('@/app/layout')).default;

    const html = renderToStaticMarkup(
      await RootLayout({
        children: <main id="main-content">Route content</main>,
      }),
    );

    const mainCount = (html.match(/<main\b/g) ?? []).length;
    expect(mainCount).toBe(1);
  });
});
