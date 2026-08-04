// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  findAnchorByHref,
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
            '### Details',
            '',
            '- First item',
            '- Second item',
            '',
            '| Provider | Purpose |',
            '|---|---|',
            '| Example | Testing |',
            '',
            '[Privacy Policy](/privacy)',
            '',
            '<script>alert("unsafe")</script>',
          ].join('\n'),
        }}
      />,
    );
    const doc = parseHtml(html);

    expect(findHeadingByText(doc, 'Policy title', { level: 1 })).not.toBeNull();
    expect(findHeadingByText(doc, 'Details', { level: 2 })).not.toBeNull();
    expect(doc.querySelectorAll('li')).toHaveLength(2);
    expect(doc.querySelector('table')?.textContent).toContain('Example');
    expect(findAnchorByHref(doc, '/privacy')?.textContent).toBe(
      'Privacy Policy',
    );
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

    expect(html.toLowerCase()).not.toContain('javascript:');
  });
});
