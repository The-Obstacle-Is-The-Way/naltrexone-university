// @vitest-environment jsdom
'use client';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('unexpected redirect');
  },
}));

describe('app/(app)/app/practice', () => {
  it('renders a practice shell', async () => {
    const PracticePage = (await import('./page')).default;

    const html = renderToStaticMarkup(<PracticePage />);
    expect(html).toContain('Practice');
  });
});
