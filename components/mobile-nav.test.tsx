// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('MobileNav', () => {
  it('renders an accessible menu toggle button on initial render', async () => {
    const { MobileNav } = await import('@/components/mobile-nav');

    const html = renderToStaticMarkup(<MobileNav />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const button = doc.querySelector('button');

    expect(button?.getAttribute('aria-label')).toBe('Open navigation menu');
    expect(button?.getAttribute('aria-expanded')).toBe('false');

    const ariaControls = button?.getAttribute('aria-controls');
    expect(typeof ariaControls).toBe('string');
    expect(ariaControls).not.toBe('');
    expect(doc.getElementById(ariaControls ?? '')).toBeNull();
  });

  it('renders hamburger button on initial render', async () => {
    const { MobileNav } = await import('@/components/mobile-nav');

    const html = renderToStaticMarkup(<MobileNav />);

    expect(html).toContain('Open navigation menu');
    // Should have the hamburger menu icon (Menu from lucide-react)
    expect(html).toContain('size-6');
    expect(html).toContain('transition-colors');
  });

  it('does not render links when menu is closed (initial state)', async () => {
    const { MobileNav } = await import('@/components/mobile-nav');

    const html = renderToStaticMarkup(<MobileNav />);

    // Links should NOT be visible when menu is closed
    expect(html).not.toContain('/app/dashboard');
    expect(html).not.toContain('/app/practice');
    expect(html).not.toContain('/app/review');
    expect(html).not.toContain('/app/bookmarks');
    expect(html).not.toContain('/app/billing');
  });

  it('has sm:hidden class to only show on mobile', async () => {
    const { MobileNav } = await import('@/components/mobile-nav');

    const html = renderToStaticMarkup(<MobileNav />);

    expect(html).toContain('sm:hidden');
  });
});
