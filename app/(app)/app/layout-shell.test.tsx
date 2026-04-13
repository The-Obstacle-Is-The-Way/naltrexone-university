// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

type AppLayoutModule = typeof import('@/app/(app)/app/layout');

let AppLayoutShell: AppLayoutModule['AppLayoutShell'];
let renderAppLayout: AppLayoutModule['renderAppLayout'];

beforeAll(async () => {
  const module = await import('@/app/(app)/app/layout');
  AppLayoutShell = module.AppLayoutShell;
  renderAppLayout = module.renderAppLayout;
});

describe('app/(app)/app/layout (shell)', () => {
  it('renders the app navigation and children', async () => {
    const html = renderToStaticMarkup(
      <AppLayoutShell
        authNav={<div>AuthNav</div>}
        mobileNav={<div>MobileNav</div>}
      >
        <div>Child content</div>
      </AppLayoutShell>,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const brandLink = doc.querySelector('header a[href="/app/dashboard"]');
    const main = doc.querySelector('main#main-content');

    expect(brandLink).not.toBeNull();
    if (!brandLink) {
      throw new Error('Expected app header brand link to exist');
    }
    expect(main).not.toBeNull();
    if (!main) {
      throw new Error('Expected app main shell to exist');
    }
    const brandClassTokens = (brandLink.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter(Boolean);

    expect(html).toContain('Addiction Boards');
    expect(html).toContain('href="/app/dashboard"');
    expect(html).toContain('href="/app/practice"');
    expect(html).toContain('href="/app/history"');
    expect(html).toContain('href="/app/bookmarks"');
    expect(html).toContain('href="/app/billing"');
    expect(html).toContain('AuthNav');
    expect(html).toContain('MobileNav');
    expect(html).toContain('Child content');
    expect(html).toContain('min-h-screen bg-background');
    expect(html).not.toContain('min-h-screen bg-muted');
    expect(html).toContain('<main id="main-content"');
    expect(main.getAttribute('style')).toContain(
      '--app-shell-chrome-height:8rem',
    );
    expect(brandClassTokens).toContain('font-heading');
    expect(brandClassTokens).toContain('font-bold');
    expect(brandClassTokens).toContain('text-base');
    expect(brandClassTokens).toContain('whitespace-nowrap');
  });

  it('renders AppLayout via renderAppLayout with injected deps', async () => {
    const enforceEntitledAppUserFn = vi.fn(async () => ({
      subscriptionStatus: 'active' as const,
    }));
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
    expect(html).not.toContain('payment failed');
  });

  it('starts auth nav before entitlement resolves', async () => {
    let resolveEntitledAppUser:
      | ((value: { subscriptionStatus: 'active' }) => void)
      | undefined;
    const enforceEntitledAppUserFn = vi.fn(
      () =>
        new Promise<{ subscriptionStatus: 'active' }>((resolve) => {
          resolveEntitledAppUser = resolve;
        }),
    );
    const authNavFn = vi.fn(async () => <div>AuthNav</div>);

    const renderPromise = renderAppLayout({
      children: <div>Child content</div>,
      enforceEntitledAppUserFn,
      authNavFn,
      mobileNav: <div>MobileNav</div>,
    });

    expect(enforceEntitledAppUserFn).toHaveBeenCalledTimes(1);
    expect(authNavFn).toHaveBeenCalledTimes(1);

    resolveEntitledAppUser?.({ subscriptionStatus: 'active' });

    const element = await renderPromise;
    const html = renderToStaticMarkup(element);

    expect(html).toContain('AuthNav');
    expect(html).toContain('Child content');
  });

  it('renders payment-failed banner for pastDue subscribers', async () => {
    const enforceEntitledAppUserFn = vi.fn(async () => ({
      subscriptionStatus: 'pastDue' as const,
    }));
    const authNavFn = vi.fn(async () => <div>AuthNav</div>);

    const element = await renderAppLayout({
      children: <div>Child content</div>,
      enforceEntitledAppUserFn,
      authNavFn,
      mobileNav: <div>MobileNav</div>,
    });

    const html = renderToStaticMarkup(element);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const billingLink = doc.querySelector('a[href="/app/billing"]');

    if (!billingLink) {
      throw new Error('Expected billing link to be present in past-due banner');
    }
    const banner = billingLink.parentElement;

    expect(html).toContain('Your payment failed');
    expect(html).toContain('update your billing information');
    expect(billingLink.getAttribute('href')).toBe('/app/billing');
    expect(banner?.tagName).toBe('DIV');
    expect(html).toContain('Child content');
  });

  it('renders a suspense fallback when child content suspends', async () => {
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
    expect(html).toContain('aria-live="polite"');
  });
});
