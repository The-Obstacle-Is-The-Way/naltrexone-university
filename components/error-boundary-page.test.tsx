// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let ErrorBoundaryPage: typeof import('./error-boundary-page').ErrorBoundaryPage;

beforeAll(async () => {
  ErrorBoundaryPage = (await import('./error-boundary-page')).ErrorBoundaryPage;
});

describe('ErrorBoundaryPage', () => {
  const baseProps = {
    error: new Error('boom') as Error & { digest?: string },
    retry: () => undefined,
    title: 'Something went wrong',
    description: 'Please try again.',
    links: [{ href: '/', label: 'Go home' }],
  };

  it('renders h1 heading variant with tracking-tight when main landmark is included', () => {
    const html = renderToStaticMarkup(
      <ErrorBoundaryPage {...baseProps} includeMainLandmark />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const headingClass = doc.querySelector('h1')?.getAttribute('class') ?? '';

    expect(headingClass).toContain('text-xl');
    expect(headingClass).toContain('font-semibold');
    expect(headingClass).toContain('font-heading');
    expect(headingClass).toContain('tracking-tight');
    expect(headingClass).toContain('text-foreground');
  });

  it('renders h2 heading variant with tracking-tight when main landmark is excluded', () => {
    const html = renderToStaticMarkup(
      <ErrorBoundaryPage {...baseProps} includeMainLandmark={false} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const headingClass = doc.querySelector('h2')?.getAttribute('class') ?? '';

    expect(headingClass).toContain('text-xl');
    expect(headingClass).toContain('font-semibold');
    expect(headingClass).toContain('font-heading');
    expect(headingClass).toContain('tracking-tight');
    expect(headingClass).toContain('text-foreground');
  });

  // BUG-326: support by email, with the page and error ID, never a public
  // issue tracker.
  it('offers support by email with the page and error ID, not a public tracker', () => {
    const html = renderToStaticMarkup(
      <ErrorBoundaryPage
        {...baseProps}
        title="Billing"
        error={Object.assign(new Error('boom'), { digest: 'digest-123' })}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const contact = [...doc.querySelectorAll('a')].find(
      (link) => link.textContent === 'Contact support',
    );

    expect(contact?.getAttribute('href')).toBe(
      `mailto:support@addictionboards.com?subject=${encodeURIComponent(
        'Addiction Boards support: Billing (error ID digest-123)',
      )}`,
    );
    expect(html).not.toContain('github.com');
  });
});
