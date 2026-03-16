// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

type MobileNavModule = typeof import('@/components/mobile-nav');
let MobileNav: MobileNavModule['MobileNav'];

beforeAll(async () => {
  ({ MobileNav } = await import('@/components/mobile-nav'));
});

describe('MobileNav', () => {
  it('renders an accessible menu toggle button on initial render', () => {
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

  it('renders hamburger button on initial render', () => {
    const html = renderToStaticMarkup(<MobileNav />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const button = doc.querySelector(
      'button[aria-label="Open navigation menu"]',
    );

    expect(button).not.toBeNull();
    expect(button?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('uses 44px-equivalent padding on the hamburger touch target', () => {
    const html = renderToStaticMarkup(<MobileNav />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const button = doc.querySelector(
      'button[aria-label="Open navigation menu"]',
    );
    const classTokens = (button?.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter(Boolean);

    expect(classTokens).toContain('p-2.5');
    expect(classTokens).not.toContain('p-2');
  });

  it('does not render links when menu is closed (initial state)', () => {
    const html = renderToStaticMarkup(<MobileNav />);

    // Links should NOT be visible when menu is closed
    expect(html).not.toContain('/app/dashboard');
    expect(html).not.toContain('/app/practice');
    expect(html).not.toContain('/app/bookmarks');
    expect(html).not.toContain('/app/billing');
  });

  it('has md:hidden class to only show below the app desktop breakpoint', () => {
    const html = renderToStaticMarkup(<MobileNav />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrapper = doc.body.firstElementChild;

    expect(wrapper).not.toBeNull();
    const classTokens = (wrapper?.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter(Boolean);

    expect(classTokens).toContain('md:hidden');
    expect(classTokens).not.toContain('sm:hidden');
  });
});
