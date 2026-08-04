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
    const text = doc.body.textContent ?? '';

    expect(
      findHeadingByText(doc, 'Terms of Service', { level: 1 }),
    ).not.toBeNull();
    expect(text).toContain('The Service is not medical advice');
    expect(text).toContain('$29 per month');
    expect(text).toContain('$199 per year');
    expect(text).toContain('7-day free trial with no payment method required');
    expect(text).toContain('renews automatically');
    expect(text).toContain('Billing page in the app');
    expect(text).toContain('support@addictionboards.com');
    expect(text).toContain('John H. Jung, MD, MS');
    expect(text).toContain(
      'The pricing page presents links to these Terms and the Privacy Policy before subscription and free-trial actions.',
    );
    expect(text).not.toContain('completing the Terms-consent step');
    expect(text).not.toContain('Decisions on record');
    expect(text).not.toContain('Provenance — how each factual claim');
    expect(TermsPage).toBeTypeOf('function');
  });
});
