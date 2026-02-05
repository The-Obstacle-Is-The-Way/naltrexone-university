import { describe, expect, it } from 'vitest';

describe('next.config', () => {
  it('returns a CSP header that includes worker-src blob: when headers are generated', async () => {
    const nextConfig = (await import('./next.config')).default;

    const headers = await nextConfig.headers?.();
    if (!headers) {
      throw new Error('Expected next.config to define headers()');
    }

    const cspValue = headers
      .flatMap((entry) => entry.headers)
      .find((header) => header.key === 'Content-Security-Policy')?.value;

    expect(cspValue).toContain("worker-src 'self' blob:");
  });
});
