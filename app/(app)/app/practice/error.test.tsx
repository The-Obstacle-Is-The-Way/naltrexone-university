// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let PracticeError: typeof import('./error').default;

beforeAll(async () => {
  PracticeError = (await import('./error')).default;
});

describe('app/(app)/app/practice/error', () => {
  it('renders a contextual error boundary', () => {
    const error = new Error('boom');
    (error as Error & { digest?: string }).digest = 'digest_123';

    const html = renderToStaticMarkup(
      <PracticeError error={error} reset={() => {}} />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tryAgainButton = doc.querySelector('button');

    expect(doc.querySelector('main#main-content')).not.toBeNull();
    expect(html).toContain('Practice');
    expect(html).toContain('Try again');
    expect(html).toContain('Error ID');
    expect(html).toContain('digest_123');
    expect(tryAgainButton?.getAttribute('type')).toBe('button');
  });
});
