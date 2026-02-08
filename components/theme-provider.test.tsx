// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-themes', () => ({
  ThemeProvider: ({
    children,
    attribute,
    defaultTheme,
    enableSystem,
  }: {
    children: React.ReactNode;
    attribute?: string;
    defaultTheme?: string;
    enableSystem?: boolean;
  }) => (
    <div
      data-testid="next-themes-provider"
      data-attribute={attribute}
      data-default-theme={defaultTheme}
      data-enable-system={enableSystem ? 'true' : 'false'}
    >
      {children}
    </div>
  ),
}));

describe('components/theme-provider', () => {
  it('renders children and forwards theme provider props', async () => {
    const { ThemeProvider } = await import('@/components/theme-provider');

    const html = renderToStaticMarkup(
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <div>child</div>
      </ThemeProvider>,
    );

    expect(html).toContain('data-testid="next-themes-provider"');
    expect(html).toContain('data-attribute="class"');
    expect(html).toContain('data-default-theme="system"');
    expect(html).toContain('data-enable-system="true"');
    expect(html).toContain('child');
  });
});
