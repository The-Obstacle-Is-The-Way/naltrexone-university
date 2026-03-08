// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let Markdown: typeof import('./Markdown').Markdown;

beforeAll(async () => {
  ({ Markdown } = await import('./Markdown'));
});

function findClinicalPearlCallout(doc: Document) {
  return Array.from(doc.querySelectorAll('div')).find((element) => {
    const classTokens = new Set(element.className.split(/\s+/).filter(Boolean));
    return (
      classTokens.has('border-l-2') &&
      classTokens.has('border-foreground/40') &&
      classTokens.has('pl-3')
    );
  });
}

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
    const callout = findClinicalPearlCallout(doc);

    expect(callout).toBeDefined();
    expect(callout?.textContent).toContain('Clinical Pearl');
    expect(callout?.textContent).toContain('This is the pearl.');
    expect(callout?.querySelector('strong')).toBeNull();
    expect(html).not.toContain('<strong>Clinical pearl:</strong>');
  });

  it('renders the clinical pearl label with the promoted foreground token', () => {
    const html = renderToStaticMarkup(
      <Markdown content={'**Clinical pearl:** This is the pearl.'} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const callout = findClinicalPearlCallout(doc);
    const label = callout?.querySelector('div');

    expect(label).toBeDefined();
    expect(label?.textContent).toBe('Clinical Pearl');
    expect(label?.className).toContain('text-foreground/60');
    expect(label?.className).not.toContain('text-muted-foreground');
  });

  it('keeps regular bold paragraphs rendered inline', () => {
    const html = renderToStaticMarkup(
      <Markdown content={'**Important:** This is not a pearl.'} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const callout = findClinicalPearlCallout(doc);
    const paragraph = doc.querySelector('p');

    expect(callout).toBeUndefined();
    expect(paragraph?.querySelector('strong')?.textContent).toBe('Important:');
    expect(paragraph?.textContent).toContain('This is not a pearl.');
  });

  it('detects clinical pearl label case-insensitively', () => {
    const html = renderToStaticMarkup(
      <Markdown content={'**Clinical Pearl:** Capitalized variant.'} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const callout = findClinicalPearlCallout(doc);

    expect(callout).toBeDefined();
    expect(callout?.textContent).toContain('Capitalized variant.');
  });

  it('renders a clinical pearl callout when label has no trailing content', () => {
    const html = renderToStaticMarkup(
      <Markdown content={'**Clinical pearl:**'} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const callout = findClinicalPearlCallout(doc);
    const contentParagraph = callout?.querySelector('p');

    expect(callout).toBeDefined();
    expect(callout?.textContent).toContain('Clinical Pearl');
    expect(contentParagraph).toBeDefined();
    expect(contentParagraph?.textContent).toBe('');
  });

  it('preserves inline markdown formatting inside clinical pearl content', () => {
    const html = renderToStaticMarkup(
      <Markdown
        content={'**Clinical pearl:**`naltrexone` with **caution**.'}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const callout = findClinicalPearlCallout(doc);

    expect(callout).toBeDefined();
    expect(callout?.querySelector('code')?.textContent).toBe('naltrexone');
    expect(callout?.querySelector('strong')?.textContent).toBe('caution');
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
