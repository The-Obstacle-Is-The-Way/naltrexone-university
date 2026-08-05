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
          effectiveDate: 'August 5, 2026',
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
            'Email support@addictionboards.com with questions.',
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
    expect(externalLink?.hasAttribute('node')).toBe(false);
    expect(doc.body.textContent).toContain('Last updated: August 5, 2026');
    expect(doc.querySelector('script')).toBeNull();
  });

  it('renders autolinked email addresses as same-tab mailto links', () => {
    const html = renderToStaticMarkup(
      <LegalDocument
        content={{
          title: 'Policy title',
          effectiveDate: 'August 5, 2026',
          bodyMarkdown:
            'Cancel by emailing **support@addictionboards.com** from your account address.',
        }}
      />,
    );
    const doc = parseHtml(html);

    const mailtoLink = findAnchorByHref(
      doc,
      'mailto:support@addictionboards.com',
    );
    expect(mailtoLink).not.toBeNull();
    expect(mailtoLink?.hasAttribute('target')).toBe(false);
    expect(mailtoLink?.hasAttribute('rel')).toBe(false);
    expect(mailtoLink?.hasAttribute('node')).toBe(false);
  });

  it('exposes overflowing tables as keyboard-focusable regions', () => {
    const html = renderToStaticMarkup(
      <LegalDocument
        content={{
          title: 'Policy title',
          effectiveDate: 'August 5, 2026',
          bodyMarkdown: [
            '| Provider | Purpose |',
            '|---|---|',
            '| Example | Testing |',
            '| Another | Auditing |',
          ].join('\n'),
        }}
      />,
    );
    const doc = parseHtml(html);

    const region = doc.querySelector('section[aria-label="Scrollable table"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('tabindex')).toBe('0');
    expect(region?.querySelector('table')).not.toBeNull();

    // The border-suppression variant encodes behavior: `last:` would strip the
    // bottom border from every row's last cell, not just the last row's cells.
    const bodyRows = region?.querySelectorAll('tbody tr') ?? [];
    expect(bodyRows).toHaveLength(2);
    const firstRowLastCell = bodyRows[0]?.querySelector('td:last-child');
    expect(firstRowLastCell?.classList.contains('last:border-b-0')).toBe(false);
    expect(
      firstRowLastCell?.classList.contains(
        '[tbody_tr:last-child_&]:border-b-0',
      ),
    ).toBe(true);
    expect(firstRowLastCell?.classList.contains('border-b')).toBe(true);
  });

  it('removes unsafe link protocols', () => {
    const html = renderToStaticMarkup(
      <LegalDocument
        content={{
          title: 'Policy title',
          effectiveDate: 'August 5, 2026',
          bodyMarkdown: '[Unsafe](javascript:alert(1))',
        }}
      />,
    );
    const doc = parseHtml(html);

    const unsafeLink = findElementByText<HTMLAnchorElement>(doc, 'a', 'Unsafe');
    expect(unsafeLink).not.toBeNull();
    expect(unsafeLink?.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
  });
});
