// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let Markdown: typeof import('./Markdown').Markdown;

beforeAll(async () => {
  ({ Markdown } = await import('./Markdown'));
});

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

  it('renders clinical pearl paragraphs as styled callouts with separated label and content', () => {
    const html = renderToStaticMarkup(
      <Markdown
        content={'Explanation text.\n\n**Clinical pearl:** This is the pearl.'}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const callout = Array.from(doc.querySelectorAll('div')).find((element) => {
      const classes = element.className;
      return (
        classes.includes('border-l-2') &&
        classes.includes('border-foreground/20') &&
        classes.includes('pl-3')
      );
    });

    expect(callout).toBeDefined();
    expect(callout?.textContent).toContain('Clinical Pearl');
    expect(callout?.textContent).toContain('This is the pearl.');
    expect(callout?.querySelector('strong')).toBeNull();
    expect(html).not.toContain('<strong>Clinical pearl:</strong>');
  });

  it('keeps regular bold paragraphs rendered inline', () => {
    const html = renderToStaticMarkup(
      <Markdown content={'**Important:** This is not a pearl.'} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const callout = Array.from(doc.querySelectorAll('div')).find((element) =>
      element.className.includes('border-l-2'),
    );

    expect(callout).toBeUndefined();
    expect(html).toContain('<strong>Important:</strong> This is not a pearl.');
  });

  it('detects clinical pearl label case-insensitively', () => {
    const html = renderToStaticMarkup(
      <Markdown content={'**Clinical Pearl:** Capitalized variant.'} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const callout = Array.from(doc.querySelectorAll('div')).find((element) => {
      const classes = element.className;
      return (
        classes.includes('border-l-2') &&
        classes.includes('border-foreground/20') &&
        classes.includes('pl-3')
      );
    });

    expect(callout).toBeDefined();
    expect(callout?.textContent).toContain('Capitalized variant.');
  });

  it('adds paragraph spacing utility class for multi-paragraph content', () => {
    const html = renderToStaticMarkup(
      <Markdown content={'Para 1\n\nPara 2'} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wrapper = doc.querySelector('div');

    expect(wrapper?.className).toContain('[&_p+p]:mt-3');
  });
});
