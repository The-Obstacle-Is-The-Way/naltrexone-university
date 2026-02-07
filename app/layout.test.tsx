// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

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
  Providers: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

describe('app/layout', () => {
  it('adds data-scroll-behavior on the html element', async () => {
    const RootLayout = (await import('@/app/layout')).default;

    const html = renderToStaticMarkup(
      <RootLayout>
        <div>Child content</div>
      </RootLayout>,
    );

    expect(html).toContain('data-scroll-behavior="smooth"');
  });

  it('does not nest a root main landmark around route-level content', async () => {
    const RootLayout = (await import('@/app/layout')).default;

    const html = renderToStaticMarkup(
      <RootLayout>
        <main id="main-content">Route content</main>
      </RootLayout>,
    );

    const mainCount = (html.match(/<main\b/g) ?? []).length;
    expect(mainCount).toBe(1);
  });
});
