// @vitest-environment jsdom
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/lib/routes';

type NextLinkMockProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children?: ReactNode;
};

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: NextLinkMockProps) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/theme-toggle', () => ({
  ThemeToggle: () => <span data-testid="theme-toggle" />,
}));

vi.mock('server-only', () => ({}));

type MarketingLayoutModule =
  typeof import('@/components/marketing/marketing-layout');
let MarketingLayout: MarketingLayoutModule['MarketingLayout'];

beforeAll(async () => {
  ({ MarketingLayout } = await import(
    '@/components/marketing/marketing-layout'
  ));
});

function restoreTimeZone(originalTimeZone: string | undefined) {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
    return;
  }

  process.env.TZ = originalTimeZone;
}

describe('MarketingLayout', () => {
  async function renderLayout(
    props?: Partial<Omit<Parameters<typeof MarketingLayout>[0], 'children'>>,
  ) {
    const element = await MarketingLayout({
      featuresHref: '/#features',
      children: <div>Content</div>,
      ...props,
    });
    return renderToStaticMarkup(element);
  }

  it('renders the footer copyright year from UTC, not the local runtime year', async () => {
    const originalTimeZone = process.env.TZ;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:30:00.000Z'));
    process.env.TZ = 'America/New_York';

    try {
      const html = await renderLayout({ authNavSlot: <div>Auth</div> });
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const footer = doc.querySelector('footer');

      expect(footer?.textContent).toContain('© 2026 Addiction Boards');
    } finally {
      restoreTimeZone(originalTimeZone);
      vi.useRealTimers();
    }
  });

  it('renders a single focusable main landmark', async () => {
    const html = await renderLayout({ authNavSlot: <div>Auth</div> });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const mainLandmarks = doc.querySelectorAll('main');

    expect(mainLandmarks).toHaveLength(1);
    expect(mainLandmarks[0]?.getAttribute('id')).toBe('main-content');
    expect(mainLandmarks[0]?.getAttribute('tabindex')).toBe('-1');
  });

  it('uses sentence case auth labels in the footer', async () => {
    const html = await renderLayout({ authNavSlot: <div>Auth</div> });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const footer = doc.querySelector('footer');
    const signInLink = footer?.querySelector(`a[href="${ROUTES.SIGN_IN}"]`);
    const signUpLink = footer?.querySelector(`a[href="${ROUTES.SIGN_UP}"]`);

    expect(signInLink?.textContent?.trim()).toBe('Sign in');
    expect(signUpLink?.textContent?.trim()).toBe('Sign up');
  });

  it('applies the stronger header brand treatment to the brand link', async () => {
    const html = await renderLayout({ authNavSlot: <div>Auth</div> });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const brandLink = doc.querySelector(`header a[href="${ROUTES.HOME}"]`);

    expect(brandLink).not.toBeNull();
    if (!brandLink) {
      throw new Error('Expected marketing header brand link to exist');
    }
    const classTokens = (brandLink.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter(Boolean);

    expect(classTokens).toContain('text-foreground');
    expect(classTokens).toContain('hover:text-foreground/80');
    expect(classTokens).toContain('transition-colors');
    expect(classTokens).toContain('font-heading');
    expect(classTokens).toContain('font-bold');
    expect(classTokens).toContain('text-base');
    expect(classTokens).toContain('whitespace-nowrap');
  });

  it('keeps the marketing desktop nav on sm:flex', async () => {
    const html = await renderLayout({ authNavSlot: <div>Auth</div> });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const desktopNav = doc.querySelector(
      'nav[aria-label="Marketing navigation (desktop)"]',
    );

    expect(desktopNav).not.toBeNull();
    if (!desktopNav) {
      throw new Error('Expected marketing desktop nav to exist');
    }
    const classTokens = (desktopNav.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter(Boolean);

    expect(classTokens).toContain('sm:flex');
    expect(classTokens).not.toContain('md:flex');
  });

  it('applies the stronger footer brand treatment', async () => {
    const html = await renderLayout({ authNavSlot: <div>Auth</div> });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const footerBrand = Array.from(doc.querySelectorAll('footer p')).find(
      (element) => element.textContent?.trim() === 'Addiction Boards',
    );

    expect(footerBrand).not.toBeUndefined();
    if (!footerBrand) {
      throw new Error('Expected marketing footer brand text to exist');
    }
    const classTokens = (footerBrand.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter(Boolean);

    expect(classTokens).toContain('font-heading');
    expect(classTokens).toContain('font-bold');
    expect(classTokens).toContain('text-foreground');
  });

  it('renders a mobile marketing nav so Features/Pricing are reachable', async () => {
    const html = await renderLayout({ authNavSlot: <div>Auth</div> });

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const mobileNav = doc.querySelector(
      'nav[aria-label="Marketing navigation (mobile)"]',
    );

    expect(mobileNav).not.toBeNull();
    const mobileNavElement = mobileNav as HTMLElement;

    expect(
      mobileNavElement.querySelector('a[href="/#features"]'),
    ).not.toBeNull();
    expect(
      mobileNavElement.querySelector(`a[href="${ROUTES.PRICING}"]`),
    ).not.toBeNull();
  });

  it('includes ThemeToggle in the header action area', async () => {
    const html = await renderLayout({ authNavSlot: <div>Auth</div> });

    expect(html).toContain('data-testid="theme-toggle"');
  });

  it('renders a static sign-in fallback when auth nav is deferred', async () => {
    const html = await renderLayout();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const header = doc.querySelector('header');

    expect(
      header?.querySelector('a[href="/sign-in"]')?.textContent?.trim(),
    ).toBe('Sign in');
    expect(header?.querySelector('[data-testid="user-button"]')).toBeNull();
  });
});
