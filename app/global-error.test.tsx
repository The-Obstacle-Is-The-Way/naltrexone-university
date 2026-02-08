// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('app/global-error', () => {
  it('renders a full-document error UI', async () => {
    const GlobalErrorPage = (await import('./global-error')).default;

    const error = new Error('boom');
    (error as Error & { digest?: string }).digest = 'digest_123';
    const html = renderToStaticMarkup(
      <GlobalErrorPage error={error} reset={() => {}} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tryAgainButton = doc.querySelector('button');

    expect(html).toContain('Something went wrong');
    expect(html).toContain('Try again');
    expect(html).toContain('Error ID');
    expect(html).toContain('digest_123');
    expect(html).toContain('<html');
    expect(tryAgainButton?.getAttribute('type')).toBe('button');
  }, 10_000);
});
