'use client';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('app/global-error', () => {
  it('renders a full-document error UI', async () => {
    const GlobalErrorPage = (await import('./global-error')).default;

    const html = renderToStaticMarkup(
      <GlobalErrorPage error={new Error('boom')} reset={() => {}} />,
    );

    expect(html).toContain('<html');
    expect(html).toContain('Something went wrong');
    expect(html).toContain('Try again');
  });
});
