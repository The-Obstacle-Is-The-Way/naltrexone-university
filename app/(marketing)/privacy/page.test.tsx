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
    /^\*\*Last updated: August 5, 2026\*\*\n\n/,
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
    expect(privacyContent.effectiveDate).toBe('August 5, 2026');
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
    expect(text).not.toContain('Provenance and adversarial verification');
    expect(text).not.toContain('OWNER TO IDENTIFY');
  });

  it('delegates the route default export to the privacy renderer', async () => {
    // Element-tree equality (not just "resolves defined") so the route cannot
    // silently swap in a different renderer or content module.
    expect(await PrivacyPage()).toEqual(await renderPrivacyPage());
  });
});
