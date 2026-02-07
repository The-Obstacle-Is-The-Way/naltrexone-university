// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('app/error', () => {
  it('renders a recoverable error UI', async () => {
    const ErrorPage = (await import('./error')).default;

    const error = new Error('boom');
    (error as Error & { digest?: string }).digest = 'digest_123';
    const html = renderToStaticMarkup(
      <ErrorPage error={error} reset={() => {}} />,
    );

    expect(html).toContain('Something went wrong');
    expect(html).toContain('Try again');
    expect(html).toContain('Error ID');
    expect(html).toContain('digest_123');
    expect(html).toContain('focus-visible:ring-[3px]');
    expect(html).toContain('<main id="main-content"');
    expect(html).toContain('tabindex="-1"');
  }, 10_000);
});
