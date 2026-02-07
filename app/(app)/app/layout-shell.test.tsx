// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('app/(app)/app/layout (shell)', () => {
  it('renders the app navigation and children', async () => {
    const { AppLayoutShell } = await import('@/app/(app)/app/layout');

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
    expect(html).toContain('<main id="main-content"');
  }, 10_000);

  it('renders AppLayout via renderAppLayout with injected deps', async () => {
    const { renderAppLayout } = await import('@/app/(app)/app/layout');

    const enforceEntitledAppUserFn = vi.fn(async () => undefined);
    const authNavFn = vi.fn(async () => <div>AuthNav</div>);

    const element = await renderAppLayout({
      children: <div>Child content</div>,
      enforceEntitledAppUserFn,
      authNavFn,
      mobileNav: <div>MobileNav</div>,
    });

    const html = renderToStaticMarkup(element);

    expect(enforceEntitledAppUserFn).toHaveBeenCalledTimes(1);
    expect(authNavFn).toHaveBeenCalledTimes(1);
    expect(html).toContain('AuthNav');
    expect(html).toContain('MobileNav');
    expect(html).toContain('Child content');
  });

  it('renders a suspense fallback when child content suspends', async () => {
    const { AppLayoutShell } = await import('@/app/(app)/app/layout');

    function Suspends(): never {
      throw Promise.resolve();
    }

    const html = renderToStaticMarkup(
      <AppLayoutShell
        authNav={<div>AuthNav</div>}
        mobileNav={<div>MobileNav</div>}
      >
        <Suspends />
      </AppLayoutShell>,
    );

    expect(html).toContain('Loading app content…');
  });
});
