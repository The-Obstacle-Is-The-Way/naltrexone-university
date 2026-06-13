import { describe, expect, it } from 'vitest';

describe('next.config', () => {
  it('keeps static security headers in next.config without taking CSP ownership from proxy middleware', async () => {
    const nextConfig = (await import('./next.config')).default;

    const headers = await nextConfig.headers?.();
    if (!headers) {
      throw new Error('Expected next.config to define headers()');
    }

    const allHeaders = headers.flatMap((entry) => entry.headers);
    const enforcedCspValue = allHeaders.find(
      (header) => header.key === 'Content-Security-Policy',
    )?.value;
    const reportOnlyCspValue = allHeaders.find(
      (header) => header.key === 'Content-Security-Policy-Report-Only',
    )?.value;
    const headerKeys = allHeaders.map((header) => header.key);

    expect(headerKeys).toEqual(
      expect.arrayContaining([
        'X-Content-Type-Options',
        'Referrer-Policy',
        'X-Frame-Options',
        'Permissions-Policy',
        'Strict-Transport-Security',
      ]),
    );
    expect(enforcedCspValue).toBeUndefined();
    expect(reportOnlyCspValue).toBeUndefined();
  });
});
