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

  it('keeps same-page anchors in this tab and treats protocol-relative hrefs as external', () => {
    const html = renderToStaticMarkup(
      <LegalDocument
        content={{
          title: 'Policy title',
          effectiveDate: 'August 5, 2026',
          bodyMarkdown: [
            '[Retention](#retention)',
            '',
            '[Protocol relative](//evil.example.com/steal)',
          ].join('\n'),
        }}
      />,
    );
    const doc = parseHtml(html);

    const anchor = findAnchorByHref(doc, '#retention');
    expect(anchor).not.toBeNull();
    expect(anchor?.hasAttribute('target')).toBe(false);

    // A leading `//` is protocol-relative — external despite the leading
    // slash, and must never be handed to next/link as an app route.
    const protocolRelative = findAnchorByHref(doc, '//evil.example.com/steal');
    expect(protocolRelative?.getAttribute('target')).toBe('_blank');
    expect(protocolRelative?.getAttribute('rel')).toBe('noreferrer noopener');
  });

  it('preserves a markdown link title on internal routes as well as external', () => {
    const html = renderToStaticMarkup(
      <LegalDocument
        content={{
          title: 'Policy title',
          effectiveDate: 'August 5, 2026',
          bodyMarkdown: [
            '[Privacy Policy](/privacy "Our privacy policy")',
            '',
            '[External](https://example.com/x "External policy")',
          ].join('\n'),
        }}
      />,
    );
    const doc = parseHtml(html);

    expect(findAnchorByHref(doc, '/privacy')?.getAttribute('title')).toBe(
      'Our privacy policy',
    );
    expect(
      findAnchorByHref(doc, 'https://example.com/x')?.getAttribute('title'),
    ).toBe('External policy');
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

  it('normalizes a case-insensitive mailto scheme before sanitization', () => {
    const html = renderToStaticMarkup(
      <LegalDocument
        content={{
          title: 'Policy title',
          effectiveDate: 'August 5, 2026',
          bodyMarkdown: '[Email support](MAILTO:support@addictionboards.com)',
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
  });

  it('keeps empty and relative same-origin links in this tab', () => {
    const html = renderToStaticMarkup(
      <LegalDocument
        content={{
          title: 'Policy title',
          effectiveDate: 'August 5, 2026',
          bodyMarkdown: ['[Empty]()', '', '[Relative](terms)'].join('\n'),
        }}
      />,
    );
    const doc = parseHtml(html);

    for (const href of ['', 'terms']) {
      const link = findAnchorByHref(doc, href);
      expect(link).not.toBeNull();
      expect(link?.hasAttribute('target')).toBe(false);
      expect(link?.hasAttribute('rel')).toBe(false);
    }
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

    // The scroll container is the table's wrapper: focusable, but with no role
    // or accessible name, so repeated tables don't collide as landmarks.
    const region = doc.querySelector('table')?.parentElement;
    expect(region).not.toBeNull();
    expect(region?.getAttribute('tabindex')).toBe('0');
    expect(region?.hasAttribute('role')).toBe(false);
    expect(region?.hasAttribute('aria-label')).toBe(false);

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
    expect(unsafeLink?.hasAttribute('href')).toBe(false);
    expect(unsafeLink?.hasAttribute('target')).toBe(false);
    expect(unsafeLink?.hasAttribute('rel')).toBe(false);
  });
});
