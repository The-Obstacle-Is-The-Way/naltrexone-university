// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ErrorCard } from './error-card';

describe('ErrorCard', () => {
  it('renders a consistent accessible error container', () => {
    const html = renderToStaticMarkup(
      <ErrorCard>Something went wrong.</ErrorCard>,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('data-error-card="true"');
    expect(html).toContain('Something went wrong.');
  });
});
