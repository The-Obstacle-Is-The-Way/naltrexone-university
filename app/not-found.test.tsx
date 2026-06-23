// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { findMainLandmarkById, parseHtml } from '@/tests/shared/dom-helpers';

let NotFound: typeof import('./not-found').default;

beforeAll(async () => {
  NotFound = (await import('./not-found')).default;
});

describe('app/not-found', () => {
  it('renders a 404 page with a valid skip-link target landmark', () => {
    const html = renderToStaticMarkup(<NotFound />);
    const doc = parseHtml(html);
    const heading = doc.querySelector('h1');
    const main = findMainLandmarkById(doc, 'main-content');

    expect(html).toContain('Page Not Found');
    expect(html).toContain('Back to Home');
    expect(main).not.toBeNull();
    expect(main?.getAttribute('tabindex')).toBe('-1');
    expect(heading?.getAttribute('class') ?? '').toContain('font-heading');
  });
});
