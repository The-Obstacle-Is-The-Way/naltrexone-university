// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { findHeadingByText, parseHtml } from '@/tests/shared/dom-helpers';

vi.mock('server-only', () => ({}));

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

let PrivacyPage: typeof import('./page').default;
let renderPrivacyPage: typeof import('./privacy-page-renderer').renderPrivacyPage;
let privacyContent: typeof import('./privacy-content').privacyContent;

beforeAll(async () => {
  [{ default: PrivacyPage }, { renderPrivacyPage }, { privacyContent }] =
    await Promise.all([
      import('./page'),
      import('./privacy-page-renderer'),
      import('./privacy-content'),
    ]);
});

function publicPrivacyMarkdown(): string {
  const source = readFileSync('docs/legal/privacy-policy.md', 'utf8');
  const publicSection = source
    .split('## Privacy Policy\n\n')[1]
    ?.split('\n---\n\n## Provenance and adversarial verification')[0];
  const body = publicSection?.replace(
    /^\*\*Last updated: August 6, 2026\*\*\n\n/,
    '',
  );

  if (!body) {
    throw new Error('Expected published Privacy Policy section');
  }

  return body.trim();
}

describe('PrivacyPage', () => {
  it('keeps the typed page content verbatim with the committed public copy', () => {
    expect(privacyContent.title).toBe('Privacy Policy');
    expect(privacyContent.effectiveDate).toBe('August 6, 2026');
    expect(privacyContent.bodyMarkdown).toBe(publicPrivacyMarkdown());
  });

  it('renders mandatory clauses and every selected direct provider', async () => {
    const html = renderToStaticMarkup(
      await renderPrivacyPage({ authNavSlot: <div>Auth</div> }),
    );
    const doc = parseHtml(html);
    const text = doc.body.textContent ?? '';

    expect(
      findHeadingByText(doc, 'Privacy Policy', { level: 1 }),
    ).not.toBeNull();
    expect(text).toContain('We do not sell personal information');
    expect(text).toContain('support@addictionboards.com');
    for (const provider of [
      'Clerk',
      'Stripe',
      'Neon',
      'Vercel',
      'Sentry',
      'ImprovMX',
      'Google Workspace',
      'Resend',
    ]) {
      expect(text).toContain(provider);
    }
    expect(text).toContain('Twenty-four hours is not a guaranteed maximum');
    expect(text).toContain('Sentry session replay is disabled');
    expect(text).toContain('Renewal-consent evidence');
    expect(text).toContain(
      'later of three years after consent or one year after subscription termination',
    );
    expect(text).toContain(
      'Cleanup is webhook-triggered, bounded, and best effort, so an eligible record may remain longer',
    );
    expect(text).toContain(
      'local user reference cleared and the pseudonymous consumer reference retained',
    );
    expect(text).toContain(
      'messages remain queued without contacting Resend while the credential is absent',
    );
    expect(text).toContain(
      'Renewal acknowledgment and notice delivery records',
    );
    expect(text).toContain(
      'Recipient and message payloads remain immutable across retries; delivery status, provider-event data, and retry metadata are retained and may change',
    );
    expect(text).not.toContain('change-notice contents');
    expect(text).not.toContain('change identifiers');
    expect(text).toContain(
      'Scheduled-notice rows currently have no automatic terminal deletion policy',
    );
    expect(text).toContain(
      'renewal-consent, related acknowledgment-delivery, or scheduled-notice delivery records',
    );
    expect(text).not.toContain('Provenance and adversarial verification');
    expect(text).not.toContain('OWNER TO IDENTIFY');
  });

  it('delegates the route default export to the privacy renderer', async () => {
    // Element-tree equality (not just "resolves defined") so the route cannot
    // silently swap in a different renderer. It does NOT cover a content-module
    // swap — both operands call the same renderer, which is where the content
    // module is imported; the verbatim-mirror and mandatory-clause tests above
    // are what pin the content.
    expect(await PrivacyPage()).toEqual(await renderPrivacyPage());
  });
});
