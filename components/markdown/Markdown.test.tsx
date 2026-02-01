'use client';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown } from './Markdown';

describe('Markdown', () => {
  it('renders markdown and does not render raw HTML tags', () => {
    const html = renderToStaticMarkup(
      <Markdown content={'# Title\n\n<script>alert(1)</script>'} />,
    );

    expect(html).toContain('<h1>Title</h1>');
    expect(html).not.toContain('<script>');
  });
});
