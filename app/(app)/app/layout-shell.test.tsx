// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PRICING_DATA } from '@/lib/pricing-data';
import { ROUTES } from '@/lib/routes';
import {
  findAnchorByHref,
  findButtonByText,
  findElementByText,
  findMainLandmarkById,
  isNodeBefore,
  parseHtml,
} from '@/tests/shared/dom-helpers';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

vi.mock('@/components/theme-toggle', () => ({
  ThemeToggle: () => <span data-testid="theme-toggle" />,
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
    const doc = parseHtml(html);
    const shell = doc.body.firstElementChild;
    const header = doc.querySelector('header');
    const brandLink = header
      ? findAnchorByHref(header, ROUTES.APP_DASHBOARD)
      : null;
    const main = findMainLandmarkById(doc, 'main-content');
    const expectedAppRoutes = [
      ROUTES.APP_DASHBOARD,
      ROUTES.APP_PRACTICE,
      ROUTES.APP_HISTORY,
      ROUTES.APP_BOOKMARKS,
      ROUTES.APP_BILLING,
    ];

    expect(shell).not.toBeNull();
    if (!shell) {
      throw new Error('Expected app shell root element to exist');
    }
    expect(brandLink).not.toBeNull();
    if (!brandLink) {
      throw new Error('Expected app header brand link to exist');
    }
    expect(main).not.toBeNull();
    if (!main) {
      throw new Error('Expected app main shell to exist');
    }
    const shellClassTokens = (shell.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter(Boolean);
    const brandClassTokens = (brandLink.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter(Boolean);

    expect(html).toContain('Addiction Boards');
    expect(
      expectedAppRoutes.map(
        (route) => findAnchorByHref(doc, route)?.getAttribute('href') ?? null,
      ),
    ).toEqual(expectedAppRoutes);
    expect(html).toContain('AuthNav');
    expect(html).toContain('MobileNav');
    expect(html).toContain('Child content');
    expect(main.getAttribute('tabindex')).toBe('-1');
    expect(shellClassTokens).toContain('flex');
    expect(shellClassTokens).toContain('h-dvh');
    expect(shellClassTokens).toContain('min-h-screen');
    expect(shellClassTokens).toContain('flex-col');
    expect(shellClassTokens).toContain('bg-background');
    expect(shellClassTokens).not.toContain('bg-muted');
    const mainClassTokens = (main.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter(Boolean);
    expect(brandClassTokens).toContain('font-heading');
    expect(brandClassTokens).toContain('font-bold');
    expect(brandClassTokens).toContain('text-base');
    expect(brandClassTokens).toContain('whitespace-nowrap');
    expect(mainClassTokens).toContain('flex');
    expect(mainClassTokens).toContain('flex-1');
    expect(mainClassTokens).toContain('flex-col');
    expect(mainClassTokens).toContain('min-h-0');
    expect(mainClassTokens).toContain('w-full');
  });

  it('does not mount the ThemeToggle while light mode is disabled (DEBT-421)', async () => {
    // The theme-toggle mock above is a sentinel: if the app shell re-mounts
    // ThemeToggle, its testid reappears and this assertion fails. The toggle is
    // unmounted until light mode is design-complete (Option A exit state).
    const html = renderToStaticMarkup(
      <AppLayoutShell
        authNav={<div>AuthNav</div>}
        mobileNav={<div>MobileNav</div>}
      >
        <div>Child content</div>
      </AppLayoutShell>,
    );

    expect(html).not.toContain('data-testid="theme-toggle"');
  });

  it('keeps banner, header, and main in one flex column shell', async () => {
    const html = renderToStaticMarkup(
      <AppLayoutShell
        authNav={<div>AuthNav</div>}
        mobileNav={<div>MobileNav</div>}
        banner={<div data-testid="app-banner">Banner</div>}
      >
        <div>Child content</div>
      </AppLayoutShell>,
    );

    const doc = parseHtml(html);
    const shell = doc.body.firstElementChild;
    const main = findMainLandmarkById(doc, 'main-content');

    expect(shell).not.toBeNull();
    expect(main).not.toBeNull();
    expect(shell?.children[0]?.getAttribute('data-testid')).toBe('app-banner');
    expect(shell?.children[1]?.tagName).toBe('HEADER');
    expect(shell?.children[2]?.tagName).toBe('MAIN');
    expect(shell?.className).toContain('h-dvh');
    expect(shell?.className).toContain('flex-col');
    expect(main?.className).toContain('flex-1');
    expect(main?.className).toContain('min-h-0');
  });

  it('renders AppLayout via renderAppLayout with injected deps', async () => {
    const enforceEntitledAppUserFn = vi.fn(async () => ({
      subscriptionStatus: 'active' as const,
      plan: 'monthly' as const,
      trialEndsAt: null,
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
    type EntitledActiveUser = {
      subscriptionStatus: 'active';
      plan: 'monthly';
      trialEndsAt: null;
    };
    let resolveEntitledAppUser:
      | ((value: EntitledActiveUser) => void)
      | undefined;
    const enforceEntitledAppUserFn = vi.fn(
      () =>
        new Promise<EntitledActiveUser>((resolve) => {
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

    resolveEntitledAppUser?.({
      subscriptionStatus: 'active',
      plan: 'monthly',
      trialEndsAt: null,
    });

    const element = await renderPromise;
    const html = renderToStaticMarkup(element);

    expect(html).toContain('AuthNav');
    expect(html).toContain('Child content');
  });

  it('renders payment-failed banner for pastDue subscribers', async () => {
    const enforceEntitledAppUserFn = vi.fn(async () => ({
      subscriptionStatus: 'pastDue' as const,
      plan: 'monthly' as const,
      trialEndsAt: null,
    }));
    const authNavFn = vi.fn(async () => <div>AuthNav</div>);

    const element = await renderAppLayout({
      children: <div>Child content</div>,
      enforceEntitledAppUserFn,
      authNavFn,
      mobileNav: <div>MobileNav</div>,
    });

    const html = renderToStaticMarkup(element);
    const doc = parseHtml(html);
    const billingLink = findAnchorByHref(doc, ROUTES.APP_BILLING);

    if (!billingLink) {
      throw new Error('Expected billing link to be present in past-due banner');
    }
    const banner = billingLink.parentElement;

    expect(html).toContain('Your payment failed');
    expect(html).toContain('update your billing information');
    expect(billingLink.getAttribute('href')).toBe(ROUTES.APP_BILLING);
    expect(banner?.tagName).toBe('DIV');
    expect(html).toContain('Child content');
  });

  it('renders the trial countdown banner for inTrial subscribers', async () => {
    const enforceEntitledAppUserFn = vi.fn(async () => ({
      subscriptionStatus: 'inTrial' as const,
      plan: 'annual' as const,
      trialEndsAt: new Date('2026-02-08T00:00:00Z'),
    }));
    const manageBillingActionFn = vi.fn(async () => undefined);

    const element = await renderAppLayout({
      children: <div>Child content</div>,
      enforceEntitledAppUserFn,
      authNavFn: vi.fn(async () => <div>AuthNav</div>),
      mobileNav: <div>MobileNav</div>,
      manageBillingActionFn,
      nowFn: () => new Date('2026-02-04T12:00:00Z'),
    });

    const html = renderToStaticMarkup(element);
    const doc = parseHtml(html);
    const shell = doc.body.firstElementChild;
    const banner = shell?.children[0];
    const disclosure = banner
      ? findElementByText(
          banner,
          'span',
          PRICING_DATA.annual.trialPaymentDisclosure,
        )
      : null;
    const actionButton = banner
      ? findButtonByText(banner, 'Add a card to keep access')
      : null;

    expect(
      banner ? findElementByText(banner, 'span', '4 days left in trial') : null,
    ).not.toBeNull();
    expect(disclosure).not.toBeNull();
    expect(actionButton).not.toBeNull();
    expect(
      disclosure && actionButton
        ? isNodeBefore(disclosure, actionButton)
        : false,
    ).toBe(true);
    expect(banner?.textContent).toContain('days left in trial');
    expect(shell?.children[1]?.tagName).toBe('HEADER');
    expect(banner?.querySelector('input[name="idempotencyKey"]')).not.toBe(
      null,
    );
    expect(html).not.toContain('Your payment failed');
    expect(html).toContain('Child content');
  });

  it('renders singular trial countdown copy within the final day', async () => {
    const element = await renderAppLayout({
      children: <div>Child content</div>,
      enforceEntitledAppUserFn: vi.fn(async () => ({
        subscriptionStatus: 'inTrial' as const,
        plan: 'monthly' as const,
        trialEndsAt: new Date('2026-02-08T00:00:00Z'),
      })),
      authNavFn: vi.fn(async () => <div>AuthNav</div>),
      mobileNav: <div>MobileNav</div>,
      manageBillingActionFn: vi.fn(async () => undefined),
      nowFn: () => new Date('2026-02-07T21:00:00Z'),
    });

    const html = renderToStaticMarkup(element);

    expect(html).toContain('1 day left in trial');
    expect(html).not.toContain('1 days left in trial');
  });

  it('renders no trial banner for active subscribers', async () => {
    const element = await renderAppLayout({
      children: <div>Child content</div>,
      enforceEntitledAppUserFn: vi.fn(async () => ({
        subscriptionStatus: 'active' as const,
        plan: 'monthly' as const,
        trialEndsAt: null,
      })),
      authNavFn: vi.fn(async () => <div>AuthNav</div>),
      mobileNav: <div>MobileNav</div>,
    });

    const html = renderToStaticMarkup(element);
    const doc = parseHtml(html);
    const shell = doc.body.firstElementChild;

    expect(html).not.toContain('left in trial');
    expect(html).not.toContain('Add a card to keep access');
    expect(shell?.children[0]?.tagName).toBe('HEADER');
  });

  it('renders no trial banner when inTrial has no trialEndsAt', async () => {
    const element = await renderAppLayout({
      children: <div>Child content</div>,
      enforceEntitledAppUserFn: vi.fn(async () => ({
        subscriptionStatus: 'inTrial' as const,
        plan: 'monthly' as const,
        trialEndsAt: null,
      })),
      authNavFn: vi.fn(async () => <div>AuthNav</div>),
      mobileNav: <div>MobileNav</div>,
    });

    const html = renderToStaticMarkup(element);

    expect(html).not.toContain('left in trial');
    expect(html).not.toContain('Add a card to keep access');
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
