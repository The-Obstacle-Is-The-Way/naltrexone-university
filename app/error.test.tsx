// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { findMainLandmarkById, parseHtml } from '@/tests/shared/dom-helpers';

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
    const doc = parseHtml(html);
    const main = findMainLandmarkById(doc, 'main-content');
    const tryAgainButton = doc.querySelector('button');

    expect(html).toContain('Something went wrong');
    expect(html).toContain('Try again');
    expect(html).toContain('Error ID');
    expect(html).toContain('digest_123');
    expect(main).not.toBeNull();
    expect(main?.getAttribute('tabindex')).toBe('-1');
    expect(tryAgainButton?.getAttribute('type')).toBe('button');
  });
});
