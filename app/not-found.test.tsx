// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('app/not-found', () => {
  it('renders a 404 page with a valid skip-link target landmark', async () => {
    const NotFound = (await import('./not-found')).default;
    const html = renderToStaticMarkup(<NotFound />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const heading = doc.querySelector('h1');

    expect(html).toContain('Page Not Found');
    expect(html).toContain('Back to Home');
    expect(html).toContain('<main id="main-content"');
    expect(html).toContain('tabindex="-1"');
    expect(heading?.getAttribute('class') ?? '').toContain('font-heading');
  });
});
