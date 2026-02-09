// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/lib/routes';

describe('app/(app)/app/practice/quick/error', () => {
  it('renders a contextual error boundary', async () => {
    const QuickPracticeError = (await import('./error')).default;

    const error = new Error('boom');
    (error as Error & { digest?: string }).digest = 'digest_123';

    const html = renderToStaticMarkup(
      <QuickPracticeError error={error} reset={() => {}} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tryAgainButton = doc.querySelector('button');

    expect(doc.querySelector('main#main-content')).not.toBeNull();
    expect(html).toContain('Quick Practice');
    expect(html).toContain('Try again');
    expect(html).toContain('Back to Practice');
    expect(
      doc.querySelector(`a[href="${ROUTES.APP_PRACTICE}"]`),
    ).not.toBeNull();
    expect(tryAgainButton?.getAttribute('type')).toBe('button');
  }, 10_000);
});
