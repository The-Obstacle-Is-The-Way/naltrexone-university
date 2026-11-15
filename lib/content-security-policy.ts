import { redactCredentialParams } from './sentry-data-collection';

// The site's Content Security Policy, report-only.
//
// BUG-378: the app builds this policy rather than taking Clerk's strict mode.
// Strict mode admits only scripts that carry the request's nonce, and the
// prerendered shells' scripts cannot carry one (DEBT-420), so every page view
// reported the site's own scripts, and the reports used up Sentry's error
// quota, which the operational alerts share. This policy lists the sources the
// site loads scripts from, so a report means a script came from somewhere the
// site does not use. Inline scripts must pass: Next.js bootstraps every page
// with them, and a prerendered page cannot hash or nonce them. It stays
// report-only: enforcing it is a separate decision, once production shows it
// quiet. tests/e2e/content-security-policy.spec.ts fails on any violation, so
// a new script host must be added here.
//
// Every directive other than `script-src` is what Clerk's strict mode sent
// through @clerk/nextjs 7.9.25: Clerk's defaults, its Frontend API in
// `connect-src`, and the app's own additions. `script-src` is the list Clerk
// documents for a policy without nonces.

const SELF = "'self'";
const CLERK_FRAUD_PROTECTION = 'https://*.protect.clerk.com';
const CLOUDFLARE_CHALLENGES = 'https://challenges.cloudflare.com';
const GOOGLE_MAPS = 'https://maps.googleapis.com';
const REPORT_TO_GROUP = 'csp-endpoint';
const MAX_URL_DECODE_PASSES = 8;

function urlNeedsRedaction(value: string): boolean {
  let decoded = value;
  for (let pass = 0; pass < MAX_URL_DECODE_PASSES; pass += 1) {
    if (redactCredentialParams(decoded) !== decoded) return true;
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      // Malformed URL encoding is not proof that the native payload is safe.
      return true;
    }
    if (next === decoded) return false;
    decoded = next;
  }
  // Bound work on caller-controlled nested redirects; uncertainty sends none.
  return true;
}

export type ContentSecurityPolicySources = {
  /** Clerk's Frontend API, which also serves Clerk JS and its UI bundle. */
  clerkFrontendApiOrigin: string | null;
  sentryIngestOrigin: string | null;
  /** Sentry's security endpoint. Without one, the policy reports nowhere. */
  reportEndpoint: string | null;
  vercelEnv: string | undefined;
  nodeEnv: string | undefined;
};

type Directives = Record<string, string[]>;

// Preview deployments show the Vercel Toolbar.
const VERCEL_TOOLBAR_DIRECTIVES: Directives = {
  'script-src': ['https://vercel.live'],
  'connect-src': ['https://vercel.live', 'wss://ws-us3.pusher.com'],
  'img-src': ['https://vercel.live', 'https://vercel.com', 'data:', 'blob:'],
  'frame-src': ['https://vercel.live'],
  'style-src': ['https://vercel.live', "'unsafe-inline'"],
  'font-src': ['https://vercel.live', 'https://assets.vercel.com'],
};

function baseDirectives({
  clerkFrontendApiOrigin,
  sentryIngestOrigin,
  nodeEnv,
}: ContentSecurityPolicySources): Directives {
  const clerkFrontendApi = clerkFrontendApiOrigin
    ? [clerkFrontendApiOrigin]
    : [];
  return {
    'base-uri': [SELF],
    'connect-src': [
      SELF,
      'https://clerk-telemetry.com',
      'https://*.clerk-telemetry.com',
      'https://api.stripe.com',
      GOOGLE_MAPS,
      'https://img.clerk.com',
      // Clerk's fraud protection answers on ports other than 443.
      `${CLERK_FRAUD_PROTECTION}:*`,
      ...clerkFrontendApi,
      'ws:',
      'wss:',
      ...(sentryIngestOrigin ? [sentryIngestOrigin] : []),
    ],
    'default-src': [SELF],
    'font-src': [SELF, 'data:', 'https:'],
    'form-action': [SELF],
    'frame-ancestors': ["'none'"],
    'frame-src': [
      SELF,
      CLOUDFLARE_CHALLENGES,
      'https://*.js.stripe.com',
      'https://js.stripe.com',
      'https://hooks.stripe.com',
      CLERK_FRAUD_PROTECTION,
    ],
    'img-src': [SELF, 'https://img.clerk.com', 'data:', 'blob:', 'https:'],
    'object-src': ["'none'"],
    'script-src': [
      SELF,
      // Next.js needs eval in development only.
      ...(nodeEnv === 'production' ? [] : ["'unsafe-eval'"]),
      "'unsafe-inline'",
      ...clerkFrontendApi,
      // Clerk's bot protection runs Cloudflare Turnstile on sign-up.
      CLOUDFLARE_CHALLENGES,
      CLERK_FRAUD_PROTECTION,
      // Clerk's defaults also admit Stripe.js and Google Maps, for Clerk's
      // billing and address components, which the site does not use. Left
      // out: Google Maps serves JSONP, a known way around a host allowlist.
    ],
    'style-src': [SELF, "'unsafe-inline'"],
    'worker-src': [SELF, 'blob:'],
  };
}

function mergeDirectives(base: Directives, extra: Directives): Directives {
  const merged: Directives = { ...base };
  for (const [name, sources] of Object.entries(extra)) {
    merged[name] = [...new Set([...(merged[name] ?? []), ...sources])];
  }
  return merged;
}

/** The response headers that set and report the policy. */
export function contentSecurityPolicyHeaders(
  sources: ContentSecurityPolicySources,
  request?: { url: string; referrer: string | null },
): Array<[string, string]> {
  const base = baseDirectives(sources);
  const directives =
    sources.vercelEnv === 'preview'
      ? mergeDirectives(base, VERCEL_TOOLBAR_DIRECTIVES)
      : base;
  const parts = Object.entries(directives).map(
    ([name, values]) => `${name} ${values.join(' ')}`,
  );
  // Native reports bypass the SDK's scrubber and carry the document URL and
  // referrer. Withhold delivery for a document whose URLs need that scrubber,
  // including Clerk's encoded return URLs. Do not mutate the auth return URL.
  // This policy lasts for the document, including subsequent SPA navigation.
  const sensitiveDocument =
    request !== undefined &&
    [request.url, request.referrer ?? ''].some(urlNeedsRedaction);
  const reportEndpoint = sensitiveDocument ? null : sources.reportEndpoint;
  if (!reportEndpoint) {
    const headers: Array<[string, string]> = [
      ['Content-Security-Policy-Report-Only', parts.join('; ')],
    ];
    // A later document must not inherit this URL as its CSP report's referrer.
    if (sensitiveDocument) headers.push(['Referrer-Policy', 'no-referrer']);
    return headers;
  }
  // `report-uri` for browsers without the Reporting API, `report-to` for the rest.
  parts.push(`report-uri ${reportEndpoint}`, `report-to ${REPORT_TO_GROUP}`);
  return [
    ['Content-Security-Policy-Report-Only', parts.join('; ')],
    ['Reporting-Endpoints', `${REPORT_TO_GROUP}="${reportEndpoint}"`],
  ];
}

const PUBLISHABLE_KEY = /^pk_(?:test|live)_([A-Za-z0-9+/=_-]+)$/;
const HOST_NAME = /^[a-z0-9.-]+$/i;

/**
 * Clerk's Frontend API origin, which a publishable key encodes as base64 of
 * `<host>$`. Null for anything else, so a malformed key cannot add a source
 * or a directive to the policy.
 */
export function clerkFrontendApiOrigin(
  publishableKey: string | undefined,
): string | null {
  const encoded = publishableKey?.match(PUBLISHABLE_KEY)?.[1];
  if (!encoded) return null;
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    // Not base64: the key is malformed, and the policy omits the host.
    return null;
  }
  if (!decoded.endsWith('$')) return null;
  const host = decoded.slice(0, -1);
  return HOST_NAME.test(host) ? `https://${host}` : null;
}
