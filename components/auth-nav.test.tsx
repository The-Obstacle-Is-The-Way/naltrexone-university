// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarketingLayout } from '@/components/marketing/marketing-layout';
import { FakeAuthGateway } from '@/src/application/test-helpers/fakes/fake-gateways';
import { FakeCheckEntitlementUseCase } from '@/src/application/test-helpers/fakes/fake-use-cases';
import { createUser } from '@/src/domain/test-helpers/factories';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

const ORIGINAL_ENV = snapshotProcessEnv();

const MARKETING_LAYOUT_PRICING_LINK_COUNT = 2;
const MARKETING_LAYOUT_FEATURES_LINK_COUNT = 2;

function getHeader(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const header = doc.querySelector('header');
  if (!header) {
    throw new Error('Expected <header> to be present');
  }
  return header;
}

function getLinksByHrefAndLabel(
  header: HTMLElement,
  input: { href: string; label: string },
): HTMLAnchorElement[] {
  return Array.from(
    header.querySelectorAll<HTMLAnchorElement>(`a[href="${input.href}"]`),
  ).filter((link) => (link.textContent ?? '').trim() === input.label);
}

async function renderMarketingLayout(authNavSlot: ReactNode) {
  const element = await MarketingLayout({
    authNavSlot,
    featuresHref: '#features',
    children: <div>Child content</div>,
  });

  return renderToStaticMarkup(element);
}

describe('AuthNav', () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders a CI fallback UI when NEXT_PUBLIC_SKIP_CLERK=true', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    vi.doMock('@clerk/nextjs', () => {
      throw new Error('Publishable key not valid.');
    });

    const { AuthNav } = await import('./auth-nav');

    const element = await AuthNav({ deps: undefined });
    const html = await renderMarketingLayout(element);

    const header = getHeader(html);
    const pricingLinks = getLinksByHrefAndLabel(header, {
      href: '/pricing',
      label: 'Pricing',
    });

    expect(pricingLinks).toHaveLength(MARKETING_LAYOUT_PRICING_LINK_COUNT);
    expect(header.querySelector('a[href="/sign-in"]')?.textContent).toBe(
      'Sign in',
    );
    expect(header.querySelector('[data-testid="user-button"]')).toBeNull();
  });

  it('scenario 1: unauthenticated landing renders only one Pricing link per breakpoint', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

    const authGateway = new FakeAuthGateway(null);
    const checkEntitlementUseCase = new FakeCheckEntitlementUseCase(
      { isEntitled: false },
      new Error('Should not be called for unauthenticated user'),
    );

    const { AuthNav } = await import('./auth-nav');

    const authNav = await AuthNav({
      deps: { authGateway, checkEntitlementUseCase },
    });

    const html = await renderMarketingLayout(authNav);

    const header = getHeader(html);
    const featuresLinks = getLinksByHrefAndLabel(header, {
      href: '#features',
      label: 'Features',
    });
    const pricingLinks = getLinksByHrefAndLabel(header, {
      href: '/pricing',
      label: 'Pricing',
    });

    expect(featuresLinks).toHaveLength(MARKETING_LAYOUT_FEATURES_LINK_COUNT);
    expect(pricingLinks).toHaveLength(MARKETING_LAYOUT_PRICING_LINK_COUNT);
    expect(header.querySelector('a[href="/sign-in"]')?.textContent).toBe(
      'Sign in',
    );
    expect(header.querySelector('[data-testid="user-button"]')).toBeNull();
  });

  it('uses default Button sizing for unauthenticated Sign in CTA', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

    const authGateway = new FakeAuthGateway(null);
    const checkEntitlementUseCase = new FakeCheckEntitlementUseCase(
      { isEntitled: false },
      new Error('Should not be called for unauthenticated user'),
    );

    const { AuthNav } = await import('./auth-nav');

    const authNav = await AuthNav({
      deps: { authGateway, checkEntitlementUseCase },
    });
    const html = await renderMarketingLayout(authNav);
    const header = getHeader(html);
    const signInLink = header.querySelector('a[href="/sign-in"]');
    const signInButton = signInLink?.closest('[data-slot="button"]');
    const classes = signInButton?.getAttribute('class') ?? '';

    expect(classes).toContain('h-9');
    expect(classes).not.toContain('h-8');
  });

  it('scenario 2: unauthenticated pricing page renders only one Pricing link per breakpoint', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

    const authGateway = new FakeAuthGateway(null);
    const checkEntitlementUseCase = new FakeCheckEntitlementUseCase(
      { isEntitled: false },
      new Error('Should not be called for unauthenticated user'),
    );

    const { AuthNav } = await import('./auth-nav');
    const PricingPage = (await import('@/app/pricing/page')).default;

    const element = await PricingPage({
      searchParams: Promise.resolve({}),
      deps: { authGateway, checkEntitlementUseCase },
      authNavFn: () =>
        AuthNav({ deps: { authGateway, checkEntitlementUseCase } }),
    });

    const html = renderToStaticMarkup(element);

    const header = getHeader(html);
    const featuresLinks = getLinksByHrefAndLabel(header, {
      href: '/#features',
      label: 'Features',
    });
    const pricingLinks = getLinksByHrefAndLabel(header, {
      href: '/pricing',
      label: 'Pricing',
    });

    expect(featuresLinks).toHaveLength(MARKETING_LAYOUT_FEATURES_LINK_COUNT);
    expect(pricingLinks).toHaveLength(MARKETING_LAYOUT_PRICING_LINK_COUNT);
    expect(header.querySelector('a[href="/sign-in"]')?.textContent).toBe(
      'Sign in',
    );
    expect(header.querySelector('[data-testid="user-button"]')).toBeNull();
  });

  it('scenario 3: authenticated entitled app pages do not duplicate the Dashboard link', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    vi.doMock('./auth-user-button', () => ({
      AuthUserButton: () => <div data-testid="user-button" />,
    }));

    const { AuthNav } = await import('./auth-nav');
    const { AppLayoutShell } = await import('@/app/(app)/app/layout');

    const user = createUser({ id: 'user_1' });
    const authGateway = new FakeAuthGateway(user);
    const checkEntitlementUseCase = new FakeCheckEntitlementUseCase({
      isEntitled: true,
    });

    const authNav = await AuthNav({
      deps: { authGateway, checkEntitlementUseCase },
      showPrimaryLink: false,
    });

    const html = renderToStaticMarkup(
      <AppLayoutShell authNav={authNav} mobileNav={<div />}>
        <div>Child content</div>
      </AppLayoutShell>,
    );

    const header = getHeader(html);
    const dashboardLinks = getLinksByHrefAndLabel(header, {
      href: '/app/dashboard',
      label: 'Dashboard',
    });

    expect(dashboardLinks).toHaveLength(1);
    expect(header.querySelector('[data-testid="user-button"]')).not.toBeNull();
  });

  it('scenario 4: authenticated entitled marketing pages keep a single Dashboard escape hatch', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    vi.doMock('./auth-user-button', () => ({
      AuthUserButton: () => <div data-testid="user-button" />,
    }));

    const { AuthNav } = await import('./auth-nav');

    const user = createUser({ id: 'user_1' });
    const authGateway = new FakeAuthGateway(user);
    const checkEntitlementUseCase = new FakeCheckEntitlementUseCase({
      isEntitled: true,
    });

    const authNav = await AuthNav({
      deps: { authGateway, checkEntitlementUseCase },
    });

    const html = await renderMarketingLayout(authNav);

    const header = getHeader(html);
    const pricingLinks = getLinksByHrefAndLabel(header, {
      href: '/pricing',
      label: 'Pricing',
    });
    const dashboardLinks = getLinksByHrefAndLabel(header, {
      href: '/app/dashboard',
      label: 'Dashboard',
    });

    expect(pricingLinks).toHaveLength(MARKETING_LAYOUT_PRICING_LINK_COUNT);
    expect(dashboardLinks).toHaveLength(1);
    expect(header.querySelector('[data-testid="user-button"]')).not.toBeNull();
    expect(header.querySelector('a[href="/sign-in"]')).toBeNull();
  });

  it('passes 44px minimum trigger sizing to Clerk UserButton appearance', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    const authUserButtonMock = vi.fn(
      (props: {
        appearance?: {
          elements?: {
            userButtonTrigger?: string;
          };
        };
      }) => (
        <div
          data-testid="user-button"
          data-user-button-trigger={
            props.appearance?.elements?.userButtonTrigger
          }
        />
      ),
    );
    vi.doMock('./auth-user-button', () => ({
      AuthUserButton: authUserButtonMock,
    }));

    const { AuthNav } = await import('./auth-nav');

    const user = createUser({ id: 'user_1' });
    const authGateway = new FakeAuthGateway(user);
    const checkEntitlementUseCase = new FakeCheckEntitlementUseCase({
      isEntitled: false,
    });

    const authNav = await AuthNav({
      deps: { authGateway, checkEntitlementUseCase },
      showPrimaryLink: false,
    });
    const html = await renderMarketingLayout(authNav);
    const header = getHeader(html);
    const userButton = header.querySelector('[data-testid="user-button"]');
    const triggerClasses =
      userButton?.getAttribute('data-user-button-trigger') ?? '';

    expect(userButton).not.toBeNull();
    expect(triggerClasses).toContain('min-h-[44px]');
    expect(triggerClasses).toContain('min-w-[44px]');
  });

  it('scenario 5: authenticated non-entitled marketing pages do not duplicate the Pricing link', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    vi.doMock('./auth-user-button', () => ({
      AuthUserButton: () => <div data-testid="user-button" />,
    }));

    const { AuthNav } = await import('./auth-nav');

    const user = createUser({ id: 'user_1' });
    const authGateway = new FakeAuthGateway(user);
    const checkEntitlementUseCase = new FakeCheckEntitlementUseCase({
      isEntitled: false,
    });

    const authNav = await AuthNav({
      deps: { authGateway, checkEntitlementUseCase },
    });

    const html = await renderMarketingLayout(authNav);

    const header = getHeader(html);
    const pricingLinks = getLinksByHrefAndLabel(header, {
      href: '/pricing',
      label: 'Pricing',
    });
    const dashboardLinks = getLinksByHrefAndLabel(header, {
      href: '/app/dashboard',
      label: 'Dashboard',
    });

    expect(pricingLinks).toHaveLength(MARKETING_LAYOUT_PRICING_LINK_COUNT);
    expect(dashboardLinks).toHaveLength(0);
    expect(header.querySelector('[data-testid="user-button"]')).not.toBeNull();
    expect(header.querySelector('a[href="/sign-in"]')).toBeNull();
  });

  it('scenario 6: authenticated non-entitled pricing page does not duplicate the Pricing link', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
    vi.doMock('./auth-user-button', () => ({
      AuthUserButton: () => <div data-testid="user-button" />,
    }));

    const { AuthNav } = await import('./auth-nav');
    const PricingPage = (await import('@/app/pricing/page')).default;

    const user = createUser({ id: 'user_1' });
    const authGateway = new FakeAuthGateway(user);
    const checkEntitlementUseCase = new FakeCheckEntitlementUseCase({
      isEntitled: false,
    });

    const element = await PricingPage({
      searchParams: Promise.resolve({}),
      deps: { authGateway, checkEntitlementUseCase },
      authNavFn: () =>
        AuthNav({ deps: { authGateway, checkEntitlementUseCase } }),
    });

    const html = renderToStaticMarkup(element);

    const header = getHeader(html);
    const featuresLinks = getLinksByHrefAndLabel(header, {
      href: '/#features',
      label: 'Features',
    });
    const pricingLinks = getLinksByHrefAndLabel(header, {
      href: '/pricing',
      label: 'Pricing',
    });
    const dashboardLinks = getLinksByHrefAndLabel(header, {
      href: '/app/dashboard',
      label: 'Dashboard',
    });

    expect(featuresLinks).toHaveLength(MARKETING_LAYOUT_FEATURES_LINK_COUNT);
    expect(pricingLinks).toHaveLength(MARKETING_LAYOUT_PRICING_LINK_COUNT);
    expect(dashboardLinks).toHaveLength(0);
    expect(header.querySelector('[data-testid="user-button"]')).not.toBeNull();
    expect(header.querySelector('a[href="/sign-in"]')).toBeNull();
  });
});
