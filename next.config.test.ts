import { describe, expect, it } from 'vitest';

describe('next.config', () => {
  it('emits CSP in report-only mode without enabling enforcement yet', async () => {
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

    expect(enforcedCspValue).toBeUndefined();
    expect(reportOnlyCspValue).toBeDefined();
    expect(reportOnlyCspValue).toContain("default-src 'self'");
    expect(reportOnlyCspValue).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://*.clerk.accounts.dev https://*.clerk.com",
    );
    expect(reportOnlyCspValue).toContain(
      "connect-src 'self' https://api.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://*.ingest.sentry.io",
    );
    expect(reportOnlyCspValue).toContain(
      'frame-src https://js.stripe.com https://hooks.stripe.com https://*.clerk.accounts.dev https://*.clerk.com',
    );
    expect(reportOnlyCspValue).toContain("style-src 'self' 'unsafe-inline'");
    expect(reportOnlyCspValue).toContain("img-src 'self' data: blob: https:");
    expect(reportOnlyCspValue).toContain("object-src 'none'");
  });

  it('documents that nonce-based CSP enforcement must move to request middleware', async () => {
    const nextConfigSource = await import('node:fs').then((fs) =>
      fs.readFileSync('next.config.ts', 'utf-8'),
    );

    expect(nextConfigSource).toContain(
      'app/layout.tsx already consumes x-nonce, but next.config headers are static',
    );
  });
});
