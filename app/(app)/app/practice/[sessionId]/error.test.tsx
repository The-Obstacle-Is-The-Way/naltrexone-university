// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let PracticeSessionError: typeof import('./error').default;

beforeAll(async () => {
  PracticeSessionError = (await import('./error')).default;
});

describe('app/(app)/app/practice/[sessionId]/error', () => {
  it('renders a contextual error boundary', () => {
    const error = new Error('boom');
    (error as Error & { digest?: string }).digest = 'digest_123';

    const html = renderToStaticMarkup(
      <PracticeSessionError error={error} reset={() => {}} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tryAgainButton = doc.querySelector('button');

    expect(doc.querySelector('main#main-content')).not.toBeNull();
    expect(html).toContain('Practice session');
    expect(html).toContain('Try again');
    expect(html).toContain('Back to Practice');
    expect(doc.querySelector('a[href="/app/practice"]')).not.toBeNull();
    expect(tryAgainButton?.getAttribute('type')).toBe('button');
  });
});
