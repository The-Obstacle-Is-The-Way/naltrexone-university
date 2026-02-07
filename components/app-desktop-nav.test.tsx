// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/dashboard',
}));

describe('AppDesktopNav', () => {
  it('applies transition-colors to inactive navigation links', async () => {
    const { AppDesktopNav } = await import('./app-desktop-nav');

    const html = renderToStaticMarkup(<AppDesktopNav />);

    expect(html).toContain(
      'text-muted-foreground transition-colors hover:text-foreground',
    );
  });
});
