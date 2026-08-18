import { describe, expect, it } from 'vitest';
import nextConfig from './next.config';
import packageJson from './package.json';

describe('next.config', () => {
  it('keeps Next build on the TypeScript API while the DEBT-460 compiler alias is present', () => {
    expect(packageJson.dependencies['@typescript/native']).toMatch(
      /^npm:typescript@\^?7\./,
    );
    expect(packageJson.dependencies.typescript).toMatch(
      /^npm:@typescript\/typescript6@\^?6\./,
    );
    expect(nextConfig.experimental?.useTypeScriptCli).toBe(false);
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
