// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  hasExplicitDocumentShell,
  parseHtml,
} from '@/tests/shared/dom-helpers';

let GlobalErrorPage: typeof import('./global-error').default;

beforeAll(async () => {
  GlobalErrorPage = (await import('./global-error')).default;
});

describe('app/global-error', () => {
  it('renders a full-document error UI', () => {
    const error = new Error('boom');
    (error as Error & { digest?: string }).digest = 'digest_123';
    const html = renderToStaticMarkup(
      <GlobalErrorPage error={error} retry={() => {}} />,
    );
    const doc = parseHtml(html);
    const tryAgainButton = doc.querySelector('button');
    const heading = doc.querySelector('h1');
    const title = doc.querySelector('head > title');
    const viewportMeta = doc.querySelector('head > meta[name="viewport"]');

    expect(html).toContain('Something went wrong');
    expect(html).toContain('Try again');
    expect(html).toContain('Error ID');
    expect(html).toContain('digest_123');
    expect(hasExplicitDocumentShell(html)).toBe(true);
    expect(title?.textContent?.trim()).toBe('Error - Addiction Boards');
    expect(viewportMeta?.getAttribute('content')).toBe(
      'width=device-width, initial-scale=1',
    );
    const htmlEl = doc.querySelector('html');
    expect(htmlEl?.getAttribute('lang')).toBe('en');
    expect(htmlEl?.getAttribute('class')?.split(/\s+/)).toContain('dark');
    expect(htmlEl?.getAttribute('style')).toBe('color-scheme:dark');
    expect(tryAgainButton?.getAttribute('type')).toBe('button');
    expect(heading?.getAttribute('class')).toBe(
      'text-2xl font-bold font-heading tracking-tight text-foreground',
    );
  });

  // BUG-326: support by email, with the error ID, never a public tracker.
  it('offers support by email with the error ID, not a public tracker', () => {
    const html = renderToStaticMarkup(
      <GlobalErrorPage
        error={Object.assign(new Error('boom'), { digest: 'digest_123' })}
        retry={() => {}}
      />,
    );
    const contact = [...parseHtml(html).querySelectorAll('a')].find(
      (link) => link.textContent === 'Contact support',
    );

    expect(contact?.getAttribute('href')).toBe(
      `mailto:support@addictionboards.com?subject=${encodeURIComponent(
        'Addiction Boards support: Something went wrong (error ID digest_123)',
      )}`,
    );
    expect(html).not.toContain('github.com');
  });
});
