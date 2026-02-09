// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
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
    const navs = Array.from(
      doc.querySelectorAll('nav[aria-label="Marketing navigation"]'),
    );
    const mobileNav = navs.find((nav) =>
      (nav.getAttribute('class') ?? '').includes('sm:hidden'),
    );

    expect(mobileNav).toBeDefined();
    if (!mobileNav) {
      throw new Error('Expected a mobile marketing nav');
    }

    expect(mobileNav.querySelector('a[href="/#features"]')).not.toBeNull();
    expect(mobileNav.querySelector('a[href="/pricing"]')).not.toBeNull();
  });
});
