import { describe, expect, it } from 'vitest';

describe('next.config', () => {
  it('does not emit a static CSP header (handled by middleware)', async () => {
    const nextConfig = (await import('./next.config')).default;

    const headers = await nextConfig.headers?.();
    if (!headers) {
      throw new Error('Expected next.config to define headers()');
    }

    const cspValue = headers
      .flatMap((entry) => entry.headers)
      .find((header) => header.key === 'Content-Security-Policy')?.value;

    expect(cspValue).toBeUndefined();
  });

  it('redirects /app/review to the History Questions tab with result=incorrect', async () => {
    const nextConfig = (await import('./next.config')).default;

    const redirects = await nextConfig.redirects?.();
    if (!redirects) {
      throw new Error('Expected next.config to define redirects()');
    }

    expect(redirects).toEqual(
      expect.arrayContaining([
        {
          source: '/app/review',
          destination: '/app/history?tab=questions&result=incorrect',
          permanent: true,
        },
      ]),
    );
  });
});
