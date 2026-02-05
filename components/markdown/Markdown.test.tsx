// @vitest-environment jsdom
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

  it('sanitizes javascript: URLs in links', () => {
    const html = renderToStaticMarkup(
      <Markdown content={'[click me](javascript:alert(1))'} />,
    );

    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('sanitizes javascript: URLs in images', () => {
    const html = renderToStaticMarkup(
      <Markdown content={'![alt](javascript:alert(1))'} />,
    );

    expect(html.toLowerCase()).not.toContain('javascript:');
  });
});
