// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('MobileNav', () => {
  it('renders hamburger button on initial render', async () => {
    const { MobileNav } = await import('./mobile-nav');

    const html = renderToStaticMarkup(<MobileNav />);

    expect(html).toContain('Open navigation menu');
    // Should have the hamburger menu icon (Menu from lucide-react)
    expect(html).toContain('size-6');
  });

  it('does not render links when menu is closed (initial state)', async () => {
    const { MobileNav } = await import('./mobile-nav');

    const html = renderToStaticMarkup(<MobileNav />);

    // Links should NOT be visible when menu is closed
    expect(html).not.toContain('/app/dashboard');
    expect(html).not.toContain('/app/practice');
    expect(html).not.toContain('/app/review');
    expect(html).not.toContain('/app/billing');
  });

  it('renders navigation links when open (MobileNavOpen variant)', async () => {
    // For static render tests, we test the expanded state via a test-only component
    const { MobileNavOpen } = await import('./mobile-nav');

    const html = renderToStaticMarkup(<MobileNavOpen />);

    expect(html).toContain('/app/dashboard');
    expect(html).toContain('/app/practice');
    expect(html).toContain('/app/review');
    expect(html).toContain('/app/billing');
    expect(html).toContain('Dashboard');
    expect(html).toContain('Practice');
    expect(html).toContain('Review');
    expect(html).toContain('Billing');
  });

  it('has sm:hidden class to only show on mobile', async () => {
    const { MobileNav } = await import('./mobile-nav');

    const html = renderToStaticMarkup(<MobileNav />);

    expect(html).toContain('sm:hidden');
  });
});
