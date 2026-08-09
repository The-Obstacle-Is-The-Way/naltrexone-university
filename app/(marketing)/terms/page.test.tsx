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
let renderTermsPage: typeof import('./terms-page-renderer').renderTermsPage;
let termsContent: typeof import('./terms-content').termsContent;

beforeAll(async () => {
  [{ default: TermsPage }, { renderTermsPage }, { termsContent }] =
    await Promise.all([
      import('./page'),
      import('./terms-page-renderer'),
      import('./terms-content'),
    ]);
});

function publicTermsMarkdown(): string {
  const source = readFileSync('docs/legal/terms-of-service.md', 'utf8');
  const publicSection = source
    .split('## Terms of Service\n\n')[1]
    ?.split('\n---\n\n## Decisions on record')[0];
  const body = publicSection?.replace(
    /^\*\*Last updated: August 9, 2026\*\*\n\n/,
    '',
  );

  if (!body) {
    throw new Error('Expected published Terms of Service section');
  }

  return body.trim();
}

describe('TermsPage', () => {
  it('records durable publication evidence without a stale deployment-state claim', () => {
    const source = readFileSync('docs/legal/terms-of-service.md', 'utf8');

    expect(source).toContain(
      '**STATUS: PUBLICATION COPY; revision dated 2026-08-09.**',
    );
    expect(source).toContain(
      'The previous public revision was production verified 2026-08-08 after promotion PR #760.',
    );
    expect(source).toContain(
      'https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/760#issuecomment-5227563312',
    );
    expect(source).toContain(
      'Deployment evidence for this revision is recorded on its promotion PR.',
    );
  });

  it('keeps the typed page content verbatim with the committed public copy', () => {
    expect(termsContent.title).toBe('Terms of Service');
    expect(termsContent.effectiveDate).toBe('August 9, 2026');
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
    expect(text).toContain(
      'It is not medical advice and does not guarantee exam results.',
    );
    expect(text).toContain('$29 per month');
    expect(text).toContain('$199 per year');
    expect(text).toContain(
      'New accounts receive a 7-day free trial. Each person may receive only one. No payment method is required to start it.',
    );
    expect(text).toContain(
      'If you do not add a payment method before the trial ends, the trial ends and you are not charged. Nothing further happens.',
    );
    expect(text).toContain('renews automatically');
    expect(text).toContain('Billing page in the app');
    expect(text).toContain('support@addictionboards.com');
    expect(text).toContain('John H. Jung, MD, MS');
    expect(text).toContain(
      'Paid plans cost $29 per month or $199 per year and renew automatically until you cancel.',
    );
    expect(text).toContain(
      'The pricing page presents links to these Terms and the Privacy Policy before subscription and free-trial actions.',
    );
    expect(text).toContain(
      'both parties consent to their jurisdiction. Despite the preceding sentence, either party may bring an individual claim in small-claims court where it qualifies.',
    );
    expect(text).not.toContain(
      'both parties consent to their jurisdiction. Either party may bring an individual claim in small-claims court where it qualifies.',
    );
    expect(text).not.toContain('completing the Terms-consent step');
    expect(text).not.toContain('Decisions on record');
    expect(text).not.toContain('Provenance — how each factual claim');
    expect(doc.querySelectorAll('code')).toHaveLength(0);
  });

  it('delegates the route default export to the terms renderer', async () => {
    // Element-tree equality (not just "resolves defined") so the route cannot
    // silently swap in a different renderer. It does NOT cover a content-module
    // swap — both operands call the same renderer, which is where the content
    // module is imported; the verbatim-mirror and mandatory-clause tests above
    // are what pin the content.
    expect(await TermsPage()).toEqual(await renderTermsPage());
  });
});
