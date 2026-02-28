// @vitest-environment jsdom
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
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

describe('MarketingLayout', () => {
  it('renders a single focusable main landmark', async () => {
    const { MarketingLayout } = await import('./marketing-layout');

    const html = renderToStaticMarkup(
      <MarketingLayout authNav={<div>Auth</div>} featuresHref="/#features">
        <div>Content</div>
      </MarketingLayout>,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const mainLandmarks = doc.querySelectorAll('main');

    expect(mainLandmarks).toHaveLength(1);
    expect(mainLandmarks[0]?.getAttribute('id')).toBe('main-content');
    expect(mainLandmarks[0]?.getAttribute('tabindex')).toBe('-1');
  });

  it('uses sentence case auth labels in the footer', async () => {
    const { MarketingLayout } = await import('./marketing-layout');

    const html = renderToStaticMarkup(
      <MarketingLayout authNav={<div>Auth</div>} featuresHref="/#features">
        <div>Content</div>
      </MarketingLayout>,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const footer = doc.querySelector('footer');
    const signInLink = footer?.querySelector(`a[href="${ROUTES.SIGN_IN}"]`);
    const signUpLink = footer?.querySelector(`a[href="${ROUTES.SIGN_UP}"]`);

    expect(signInLink?.textContent?.trim()).toBe('Sign in');
    expect(signUpLink?.textContent?.trim()).toBe('Sign up');
  });

  it('applies L-4 hover and text-foreground to the brand link', async () => {
    const { MarketingLayout } = await import('./marketing-layout');

    const html = renderToStaticMarkup(
      <MarketingLayout authNav={<div>Auth</div>} featuresHref="/#features">
        <div>Content</div>
      </MarketingLayout>,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const brandLink = doc.querySelector(`a[href="${ROUTES.HOME}"]`);

    expect(brandLink).not.toBeNull();
    const className = brandLink?.getAttribute('class') ?? '';
    expect(className).toContain('text-foreground');
    expect(className).toContain('hover:text-foreground/80');
    expect(className).toContain('transition-colors');
  });

  it('renders a mobile marketing nav so Features/Pricing are reachable', async () => {
    const { MarketingLayout } = await import('./marketing-layout');

    const html = renderToStaticMarkup(
      <MarketingLayout authNav={<div>Auth</div>} featuresHref="/#features">
        <div>Content</div>
      </MarketingLayout>,
    );

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
});
