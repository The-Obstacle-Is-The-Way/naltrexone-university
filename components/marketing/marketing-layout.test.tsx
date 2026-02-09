// @vitest-environment jsdom
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

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

    expect(mobileNav).toBeDefined();
    if (!mobileNav) {
      throw new Error('Expected a mobile marketing nav');
    }

    expect(mobileNav.querySelector('a[href="/#features"]')).not.toBeNull();
    expect(mobileNav.querySelector('a[href="/pricing"]')).not.toBeNull();
  });
});
