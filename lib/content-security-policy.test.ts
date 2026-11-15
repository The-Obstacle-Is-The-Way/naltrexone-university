import { describe, expect, it } from 'vitest';
import {
  type ContentSecurityPolicySources,
  clerkFrontendApiOrigin,
  contentSecurityPolicyHeaders,
} from './content-security-policy';

const REPORT_ENDPOINT =
  'https://o456.ingest.us.sentry.io/api/789/security/?sentry_key=abc123&sentry_environment=production';

const productionSources: ContentSecurityPolicySources = {
  clerkFrontendApiOrigin: 'https://clerk.example.com',
  sentryIngestOrigin: 'https://o456.ingest.us.sentry.io',
  reportEndpoint: REPORT_ENDPOINT,
  vercelEnv: 'production',
  nodeEnv: 'production',
};

function policyOf(sources: ContentSecurityPolicySources): string {
  const header = contentSecurityPolicyHeaders(sources).find(
    ([name]) => name === 'Content-Security-Policy-Report-Only',
  );
  if (!header) throw new Error('No report-only policy header');
  return header[1];
}

function directive(policy: string, name: string): string[] | undefined {
  const entry = policy
    .split('; ')
    .map((part) => part.split(' '))
    .find(([directiveName]) => directiveName === name);
  return entry?.slice(1);
}

describe('contentSecurityPolicyHeaders', () => {
  it('admits the site’s own and inline scripts without a nonce or strict-dynamic', () => {
    const scriptSources = directive(policyOf(productionSources), 'script-src');

    expect(scriptSources).toEqual([
      "'self'",
      "'unsafe-inline'",
      'https://clerk.example.com',
      'https://challenges.cloudflare.com',
      'https://*.protect.clerk.com',
      'https://js.stripe.com',
      'https://*.js.stripe.com',
      'https://maps.googleapis.com',
    ]);
  });

  it('keeps every other directive Clerk’s strict mode sent', () => {
    expect(policyOf(productionSources)).toBe(
      [
        "base-uri 'self'",
        "connect-src 'self' https://clerk-telemetry.com https://*.clerk-telemetry.com https://api.stripe.com https://maps.googleapis.com https://img.clerk.com https://*.protect.clerk.com:* https://clerk.example.com ws: wss: https://o456.ingest.us.sentry.io",
        "default-src 'self'",
        "font-src 'self' data: https:",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "frame-src 'self' https://challenges.cloudflare.com https://*.js.stripe.com https://js.stripe.com https://hooks.stripe.com https://*.protect.clerk.com",
        "img-src 'self' https://img.clerk.com data: blob: https:",
        "object-src 'none'",
        "script-src 'self' 'unsafe-inline' https://clerk.example.com https://challenges.cloudflare.com https://*.protect.clerk.com https://js.stripe.com https://*.js.stripe.com https://maps.googleapis.com",
        "style-src 'self' 'unsafe-inline'",
        "worker-src 'self' blob:",
        `report-uri ${REPORT_ENDPOINT}`,
        'report-to csp-endpoint',
      ].join('; '),
    );
  });

  it('sends reports to Sentry by both reporting mechanisms', () => {
    expect(contentSecurityPolicyHeaders(productionSources)).toContainEqual([
      'Reporting-Endpoints',
      `csp-endpoint="${REPORT_ENDPOINT}"`,
    ]);
  });

  it('sends no reports when there is no report endpoint', () => {
    const headers = contentSecurityPolicyHeaders({
      ...productionSources,
      reportEndpoint: null,
    });
    const policy = policyOf({ ...productionSources, reportEndpoint: null });

    expect(headers.map(([name]) => name)).toEqual([
      'Content-Security-Policy-Report-Only',
    ]);
    expect(directive(policy, 'report-uri')).toBeUndefined();
    expect(directive(policy, 'report-to')).toBeUndefined();
  });

  it('omits the sources it was not given', () => {
    const policy = policyOf({
      ...productionSources,
      clerkFrontendApiOrigin: null,
      sentryIngestOrigin: null,
    });

    expect(directive(policy, 'script-src')).not.toContain(
      'https://clerk.example.com',
    );
    expect(directive(policy, 'connect-src')).not.toContain(
      'https://clerk.example.com',
    );
    expect(directive(policy, 'connect-src')).not.toContain(
      'https://o456.ingest.us.sentry.io',
    );
  });

  it('admits eval outside production builds, as Next.js needs in development', () => {
    expect(
      directive(
        policyOf({ ...productionSources, nodeEnv: 'development' }),
        'script-src',
      ),
    ).toContain("'unsafe-eval'");
    expect(directive(policyOf(productionSources), 'script-src')).not.toContain(
      "'unsafe-eval'",
    );
  });

  it('admits the Vercel Toolbar on Preview only', () => {
    const preview = policyOf({ ...productionSources, vercelEnv: 'preview' });
    const production = policyOf(productionSources);

    expect(directive(preview, 'script-src')).toContain('https://vercel.live');
    expect(directive(preview, 'connect-src')).toEqual(
      expect.arrayContaining([
        'https://vercel.live',
        'wss://ws-us3.pusher.com',
      ]),
    );
    expect(directive(preview, 'img-src')).toEqual(
      expect.arrayContaining(['https://vercel.live', 'https://vercel.com']),
    );
    expect(directive(preview, 'frame-src')).toContain('https://vercel.live');
    expect(directive(preview, 'style-src')).toContain('https://vercel.live');
    expect(directive(preview, 'font-src')).toEqual(
      expect.arrayContaining([
        'https://vercel.live',
        'https://assets.vercel.com',
      ]),
    );
    expect(production).not.toContain('vercel.live');
    expect(production).not.toContain('pusher.com');
    expect(production).not.toContain('vercel.com');
  });

  it('lists each source once', () => {
    const preview = policyOf({ ...productionSources, vercelEnv: 'preview' });

    for (const part of preview.split('; ')) {
      const sources = part.split(' ').slice(1);
      expect(new Set(sources).size).toBe(sources.length);
    }
  });
});

describe('clerkFrontendApiOrigin', () => {
  const encode = (host: string) => Buffer.from(`${host}$`).toString('base64');

  it('decodes the Frontend API origin from a live or test publishable key', () => {
    expect(
      clerkFrontendApiOrigin(`pk_live_${encode('clerk.example.com')}`),
    ).toBe('https://clerk.example.com');
    expect(
      clerkFrontendApiOrigin(
        `pk_test_${encode('fine-cat-12.clerk.accounts.dev')}`,
      ),
    ).toBe('https://fine-cat-12.clerk.accounts.dev');
  });

  it('returns null for a missing or malformed key', () => {
    expect(clerkFrontendApiOrigin(undefined)).toBeNull();
    expect(clerkFrontendApiOrigin('')).toBeNull();
    expect(clerkFrontendApiOrigin('sk_live_abc')).toBeNull();
    expect(
      clerkFrontendApiOrigin(
        `pk_live_${Buffer.from('clerk.example.com').toString('base64')}`,
      ),
    ).toBeNull();
    expect(clerkFrontendApiOrigin('pk_live_%%%')).toBeNull();
  });

  it('refuses a decoded host that could add to the policy', () => {
    expect(
      clerkFrontendApiOrigin(
        `pk_live_${encode("clerk.example.com; script-src 'unsafe-eval'")}`,
      ),
    ).toBeNull();
    expect(
      clerkFrontendApiOrigin(`pk_live_${encode('evil.example.com/path')}`),
    ).toBeNull();
  });
});
