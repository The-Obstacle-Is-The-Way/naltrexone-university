// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('app/global-error', () => {
  it('renders a full-document error UI', async () => {
    const GlobalErrorPage = (await import('./global-error')).default;

    const error = new Error('boom');
    const html = renderToStaticMarkup(
      <GlobalErrorPage error={error} reset={() => {}} />,
    );

    expect(html).toContain('Something went wrong');
    expect(html).toContain('Try again');
    expect(html).toContain('<html');
  });
});
