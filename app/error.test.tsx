'use client';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('app/error', () => {
  it('renders a recoverable error UI', async () => {
    const ErrorPage = (await import('./error')).default;

    const html = renderToStaticMarkup(
      <ErrorPage error={new Error('boom')} reset={() => {}} />,
    );

    expect(html).toContain('Something went wrong');
    expect(html).toContain('Try again');
  });
});
