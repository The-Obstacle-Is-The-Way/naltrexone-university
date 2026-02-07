// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/dashboard',
}));

describe('AppDesktopNav', () => {
  it('marks the current route link with aria-current', async () => {
    const { AppDesktopNav } = await import('./app-desktop-nav');

    const html = renderToStaticMarkup(<AppDesktopNav />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const dashboardLink = doc.querySelector('a[href="/app/dashboard"]');
    const practiceLink = doc.querySelector('a[href="/app/practice"]');

    expect(dashboardLink?.getAttribute('aria-current')).toBe('page');
    expect(practiceLink?.getAttribute('aria-current')).toBeNull();
  });
});
