// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  findAnchorByHref,
  findElementByText,
  findHeadingByText,
  parseHtml,
} from '@/tests/shared/dom-helpers';

vi.mock('server-only', () => ({}));

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

let LegalDocument: typeof import('./legal-document').LegalDocument;

beforeAll(async () => {
  ({ LegalDocument } = await import('./legal-document'));
});

describe('LegalDocument', () => {
  it('renders sanitized GFM with sequential headings, lists, tables, and links', () => {
    const html = renderToStaticMarkup(
      <LegalDocument
        content={{
          title: 'Policy title',
          effectiveDate: 'August 4, 2026',
          bodyMarkdown: [
            '## Primary details',
            '',
            '### Details',
            '',
            '- First item',
            '- Second item',
            '',
            '#### Ordered details',
            '',
            '1. Numbered item with `inline code`',
            '',
            '| Provider | Purpose |',
            '|---|---|',
            '| Example | Testing |',
            '',
            '[Privacy Policy](/privacy)',
            '',
            '[External policy](https://example.com/policy)',
            '',
            '<script>alert("unsafe")</script>',
          ].join('\n'),
        }}
      />,
    );
    const doc = parseHtml(html);

    expect(findHeadingByText(doc, 'Policy title', { level: 1 })).not.toBeNull();
    expect(
      findHeadingByText(doc, 'Primary details', { level: 2 }),
    ).not.toBeNull();
    expect(findHeadingByText(doc, 'Details', { level: 2 })).not.toBeNull();
    expect(
      findHeadingByText(doc, 'Ordered details', { level: 3 }),
    ).not.toBeNull();
    expect(doc.querySelectorAll('ul li')).toHaveLength(2);
    expect(doc.querySelectorAll('ol li')).toHaveLength(1);
    expect(doc.querySelector('code')?.textContent).toBe('inline code');
    expect(doc.querySelector('table')?.textContent).toContain('Example');
    expect(findAnchorByHref(doc, '/privacy')?.textContent).toBe(
      'Privacy Policy',
    );
    const externalLink = findAnchorByHref(doc, 'https://example.com/policy');
    expect(externalLink?.getAttribute('target')).toBe('_blank');
    expect(externalLink?.getAttribute('rel')).toBe('noreferrer noopener');
    expect(doc.body.textContent).toContain('Last updated: August 4, 2026');
    expect(doc.querySelector('script')).toBeNull();
  });

  it('removes unsafe link protocols', () => {
    const html = renderToStaticMarkup(
      <LegalDocument
        content={{
          title: 'Policy title',
          effectiveDate: 'August 4, 2026',
          bodyMarkdown: '[Unsafe](javascript:alert(1))',
        }}
      />,
    );
    const doc = parseHtml(html);

    const unsafeLink = findElementByText<HTMLAnchorElement>(doc, 'a', 'Unsafe');
    expect(unsafeLink?.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
  });
});
