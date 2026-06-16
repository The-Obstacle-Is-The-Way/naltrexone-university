// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-themes', () => ({
  ThemeProvider: ({
    children,
    attribute,
    defaultTheme,
    enableSystem,
    forcedTheme,
    nonce,
  }: {
    children: React.ReactNode;
    attribute?: string;
    defaultTheme?: string;
    enableSystem?: boolean;
    forcedTheme?: string;
    nonce?: string;
  }) => (
    <div
      data-testid="next-themes-provider"
      data-attribute={attribute}
      data-default-theme={defaultTheme}
      data-enable-system={enableSystem ? 'true' : 'false'}
      data-forced-theme={forcedTheme}
      data-nonce={nonce}
    >
      {children}
    </div>
  ),
}));

describe('components/theme-provider', () => {
  it('renders children and forwards theme provider props', async () => {
    const { ThemeProvider } = await import('@/components/theme-provider');

    const html = renderToStaticMarkup(
      <ThemeProvider
        attribute="class"
        forcedTheme="dark"
        defaultTheme="dark"
        nonce="nonce-123"
      >
        <div>child</div>
      </ThemeProvider>,
    );

    expect(html).toContain('data-testid="next-themes-provider"');
    expect(html).toContain('data-attribute="class"');
    // forcedTheme is the load-bearing prop for DEBT-421 (app pinned to dark);
    // prove the wrapper forwards it (and defaultTheme) to next-themes.
    expect(html).toContain('data-forced-theme="dark"');
    expect(html).toContain('data-default-theme="dark"');
    expect(html).toContain('data-nonce="nonce-123"');
    expect(html).toContain('child');
  });
});
