// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_NAV_ITEMS } from '@/components/app-nav-items';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('AppDesktopNav', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('uses md:flex on the desktop nav container', async () => {
    vi.doMock('next/navigation', () => ({
      usePathname: () => '/app/dashboard',
    }));
    const { AppDesktopNav } = await import('./app-desktop-nav');

    const html = renderToStaticMarkup(<AppDesktopNav />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const nav = doc.querySelector('nav[aria-label="App navigation"]');

    expect(nav).not.toBeNull();
    if (!nav) {
      throw new Error('Expected app desktop nav container to exist');
    }

    const classTokens = (nav.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter(Boolean);
    expect(classTokens).toContain('md:flex');
    expect(classTokens).not.toContain('sm:flex');
  });

  it('adds whitespace-nowrap to every app desktop nav link', async () => {
    vi.doMock('next/navigation', () => ({
      usePathname: () => '/app/dashboard',
    }));
    const { AppDesktopNav } = await import('./app-desktop-nav');

    const html = renderToStaticMarkup(<AppDesktopNav />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const navLinks = Array.from(
      doc.querySelectorAll('nav[aria-label="App navigation"] a[href]'),
    );

    expect(navLinks).toHaveLength(APP_NAV_ITEMS.length);
    for (const link of navLinks) {
      const classTokens = (link.getAttribute('class') ?? '')
        .split(/\s+/)
        .filter(Boolean);
      expect(classTokens).toContain('whitespace-nowrap');
    }
  });

  it('marks the current route link with aria-current', async () => {
    vi.doMock('next/navigation', () => ({
      usePathname: () => '/app/dashboard',
    }));
    const { AppDesktopNav } = await import('./app-desktop-nav');

    const html = renderToStaticMarkup(<AppDesktopNav />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const dashboardLink = doc.querySelector('a[href="/app/dashboard"]');
    const practiceLink = doc.querySelector('a[href="/app/practice"]');

    expect(dashboardLink).not.toBeNull();
    expect(practiceLink).not.toBeNull();
    if (!dashboardLink || !practiceLink) {
      throw new Error('Expected dashboard and practice links to exist');
    }
    expect(dashboardLink.getAttribute('aria-current')).toBe('page');
    expect(practiceLink.getAttribute('aria-current')).toBeNull();
  });

  it('marks quick practice as active without also marking practice', async () => {
    vi.doMock('next/navigation', () => ({
      usePathname: () => '/app/practice/quick',
    }));
    const { AppDesktopNav } = await import('./app-desktop-nav');

    const html = renderToStaticMarkup(<AppDesktopNav />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const practiceLink = doc.querySelector('a[href="/app/practice"]');
    const quickPracticeLink = doc.querySelector(
      'a[href="/app/practice/quick"]',
    );

    expect(practiceLink).not.toBeNull();
    expect(quickPracticeLink).not.toBeNull();
    if (!practiceLink || !quickPracticeLink) {
      throw new Error('Expected practice and quick practice links to exist');
    }

    expect(quickPracticeLink.getAttribute('aria-current')).toBe('page');
    expect(practiceLink.getAttribute('aria-current')).toBeNull();
  });
});
