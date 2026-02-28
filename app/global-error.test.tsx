// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let GlobalErrorPage: typeof import('./global-error').default;

beforeAll(async () => {
  GlobalErrorPage = (await import('./global-error')).default;
});

describe('app/global-error', () => {
  it('renders a full-document error UI', () => {
    const error = new Error('boom');
    (error as Error & { digest?: string }).digest = 'digest_123';
    const html = renderToStaticMarkup(
      <GlobalErrorPage error={error} reset={() => {}} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tryAgainButton = doc.querySelector('button');
    const heading = doc.querySelector('h1');
    const title = doc.querySelector('head > title');
    const viewportMeta = doc.querySelector('head > meta[name="viewport"]');

    expect(html).toContain('Something went wrong');
    expect(html).toContain('Try again');
    expect(html).toContain('Error ID');
    expect(html).toContain('digest_123');
    expect(html).toContain('<html');
    expect(html).toContain('<head');
    expect(title?.textContent?.trim()).toBe('Error - Addiction Boards');
    expect(viewportMeta?.getAttribute('content')).toBe(
      'width=device-width, initial-scale=1',
    );
    const htmlEl = doc.querySelector('html');
    expect(htmlEl?.getAttribute('lang')).toBe('en');
    expect(tryAgainButton?.getAttribute('type')).toBe('button');
    expect(heading?.getAttribute('class')).toBe(
      'text-2xl font-bold font-heading tracking-tight text-foreground',
    );
  });
});
