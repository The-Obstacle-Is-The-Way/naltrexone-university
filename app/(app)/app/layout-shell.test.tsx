// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('app/(app)/app/layout (shell)', () => {
  it('renders the app navigation and children', async () => {
    const { AppLayoutShell } = await import('./layout');

    const html = renderToStaticMarkup(
      <AppLayoutShell
        authNav={<div>AuthNav</div>}
        mobileNav={<div>MobileNav</div>}
      >
        <div>Child content</div>
      </AppLayoutShell>,
    );

    expect(html).toContain('Addiction Boards');
    expect(html).toContain('href="/app/dashboard"');
    expect(html).toContain('href="/app/practice"');
    expect(html).toContain('href="/app/review"');
    expect(html).toContain('href="/app/bookmarks"');
    expect(html).toContain('href="/app/billing"');
    expect(html).toContain('AuthNav');
    expect(html).toContain('MobileNav');
    expect(html).toContain('Child content');
  });
});
