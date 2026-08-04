// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { findHeadingByText, parseHtml } from '@/tests/shared/dom-helpers';

vi.mock('server-only', () => ({}));

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

let TermsPage: typeof import('./page').default;
let renderTermsPage: typeof import('./page').renderTermsPage;
let termsContent: typeof import('./terms-content').termsContent;

beforeAll(async () => {
  [{ default: TermsPage, renderTermsPage }, { termsContent }] =
    await Promise.all([import('./page'), import('./terms-content')]);
});

function publicTermsMarkdown(): string {
  const source = readFileSync('docs/legal/terms-of-service.md', 'utf8');
  const publicSection = source
    .split('## Terms of Service\n\n')[1]
    ?.split('\n---\n\n## Decisions on record')[0];
  const body = publicSection?.replace(
    /^\*\*Last updated: August 4, 2026\*\*\n\n/,
    '',
  );

  if (!body) {
    throw new Error('Expected published Terms of Service section');
  }

  return body.trim();
}

describe('TermsPage', () => {
  it('keeps the typed page content verbatim with the committed public copy', () => {
    expect(termsContent.title).toBe('Terms of Service');
    expect(termsContent.effectiveDate).toBe('August 4, 2026');
    expect(termsContent.bodyMarkdown).toBe(publicTermsMarkdown());
  });

  it('renders mandatory medical and automatic-renewal clauses', async () => {
    const html = renderToStaticMarkup(
      await renderTermsPage({ authNavSlot: <div>Auth</div> }),
    );
    const doc = parseHtml(html);

    expect(
      findHeadingByText(doc, 'Terms of Service', { level: 1 }),
    ).not.toBeNull();
    expect(html).toContain('The Service is not medical advice');
    expect(html).toContain('$29 per month');
    expect(html).toContain('$199 per year');
    expect(html).toContain('7-day free trial with no payment method required');
    expect(html).toContain('renews automatically');
    expect(html).toContain('Billing page in the app');
    expect(html).toContain('support@addictionboards.com');
    expect(html).toContain('John H. Jung, MD, MS');
    expect(html).not.toContain('Decisions on record');
    expect(html).not.toContain('Provenance — how each factual claim');
    expect(TermsPage).toBeTypeOf('function');
  });
});
