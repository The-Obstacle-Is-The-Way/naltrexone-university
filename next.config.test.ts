import { describe, expect, it } from 'vitest';
import nextConfig from './next.config';

describe('next.config', () => {
  // Next 16.3 type checks builds through the canonical `typescript` package's
  // CLI by default. With TypeScript 7 under its real name that CLI exists, so
  // no opt-out may return, and type errors must still fail the build.
  // DEBT-522: left unset, Next.js warns on every build. `true` turns each
  // link's prefetch into a per-visitor server render, because the root
  // layout reads the CSP nonce from headers() on every route.
  it('keeps prefetches prerendered by turning Partial Prefetching off explicitly', () => {
    expect(nextConfig).toMatchObject({
      cacheComponents: true,
      partialPrefetching: false,
    });
  });

  it('type checks builds through the default TypeScript CLI with no bypass', () => {
    expect(nextConfig.experimental?.useTypeScriptCli).toBeUndefined();
    expect(nextConfig.typescript?.ignoreBuildErrors).not.toBe(true);
  });

  it('keeps static security headers in next.config without taking CSP ownership from proxy middleware', async () => {
    const headers = await nextConfig.headers?.();
    if (!headers) {
      throw new Error('Expected next.config to define headers()');
    }

    const allHeaders = headers.flatMap((entry) => entry.headers);
    const headerValues = Object.fromEntries(
      allHeaders.map((header) => [header.key, header.value]),
    );

    expect(headerValues).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    });
    expect(headerValues['Content-Security-Policy']).toBeUndefined();
    expect(headerValues['Content-Security-Policy-Report-Only']).toBeUndefined();
  });
});
