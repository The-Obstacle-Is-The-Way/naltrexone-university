// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('app/(app)/app/practice/[sessionId]/error', () => {
  it('renders a contextual error boundary', async () => {
    const PracticeSessionError = (await import('./error')).default;

    const error = new Error('boom');
    (error as Error & { digest?: string }).digest = 'digest_123';

    const html = renderToStaticMarkup(
      <PracticeSessionError error={error} reset={() => {}} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tryAgainButton = doc.querySelector('button');

    expect(doc.querySelector('main#main-content')).toBeNull();
    expect(html).toContain('Practice session');
    expect(html).toContain('Try again');
    expect(html).toContain('Back to Practice');
    expect(doc.querySelector('a[href="/app/practice"]')).not.toBeNull();
    expect(tryAgainButton?.getAttribute('type')).toBe('button');
  }, 10_000);
});
