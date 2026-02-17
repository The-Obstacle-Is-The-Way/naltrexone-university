// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let ErrorPage: typeof import('./error').default;

beforeAll(async () => {
  ErrorPage = (await import('./error')).default;
});

describe('app/error', () => {
  it('renders a recoverable error UI', () => {
    const error = new Error('boom');
    (error as Error & { digest?: string }).digest = 'digest_123';
    const html = renderToStaticMarkup(
      <ErrorPage error={error} reset={() => {}} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tryAgainButton = doc.querySelector('button');

    expect(html).toContain('Something went wrong');
    expect(html).toContain('Try again');
    expect(html).toContain('Error ID');
    expect(html).toContain('digest_123');
    expect(html).toContain('<main id="main-content"');
    expect(html).toContain('tabindex="-1"');
    expect(tryAgainButton?.getAttribute('type')).toBe('button');
  });
});
