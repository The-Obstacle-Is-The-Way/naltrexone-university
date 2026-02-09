// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('AppDesktopNav', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
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
