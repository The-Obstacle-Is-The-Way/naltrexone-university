import { redactSensitiveE2EText } from './e2e-log-redaction';

type RequestDetails = {
  method: string;
  url: string;
  resourceType: string;
  headers: Record<string, string>;
};

// Project before retaining anything. Arbitrary headers, bodies, query values
// and action IDs never enter the trace, even if they have no known token shape.
function requestPlace(url: string): string {
  const parsed = new URL(url);
  const known =
    ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    parsed.hostname.endsWith('.accounts.dev');
  return redactSensitiveE2EText(
    known
      ? `${parsed.host}${parsed.pathname.replace(/\/([a-z]+)_[A-Za-z0-9]{8,}/g, '/$1_…')}`
      : parsed.host,
  );
}

function flags(request: RequestDetails): string {
  return `resource=${request.resourceType} action=${'next-action' in request.headers ? 'yes' : 'no'} rsc=${'rsc' in request.headers ? 'yes' : 'no'}`;
}

function cookieLengths(header: string | undefined): string {
  if (header === undefined) return 'unavailable';
  return (
    header
      .split(';')
      .flatMap((pair) => {
        const separator = pair.indexOf('=');
        if (separator < 0) return [];
        const name = pair.slice(0, separator).trim();
        if (
          !/^__clerk_db_jwt(?:_[\w-]{8})?$|^__session(?:_[\w-]{8})?$|^__client_uat(?:_[\w-]{8})?$/.test(
            name,
          )
        )
          return [];
        const value = pair.slice(separator + 1).trim();
        // A numeric __client_uat is a time, not a credential; "0" means signed out.
        if (name.startsWith('__client_uat') && /^\d+$/.test(value))
          return [`${name}=${value}`];
        return [`${name} length=${value.length}`];
      })
      .join(', ') || 'none'
  );
}

// The decisions @clerk/backend 3.23 defines: AuthStatus, AuthErrorReason and
// TokenVerificationErrorReason, plus the expired-token reason it composes with
// each RefreshTokenErrorReason. A name Clerk adds later shows only its length.
const CLERK_DECISIONS = new Set([
  'signed-in',
  'signed-out',
  'handshake',
  'client-uat-but-no-session-token',
  'dev-browser-missing',
  'dev-browser-sync',
  'primary-responds-to-syncing',
  'primary-domain-cross-origin-sync',
  'satellite-needs-syncing',
  'session-token-and-uat-missing',
  'session-token-missing',
  'session-token-expired',
  'session-token-iat-before-client-uat',
  'session-token-nbf',
  'session-token-iat-in-the-future',
  'session-token-but-no-client-uat',
  'active-organization-mismatch',
  'token-type-mismatch',
  'unexpected-error',
  'token-expired',
  'token-invalid',
  'token-invalid-algorithm',
  'token-invalid-authorized-parties',
  'token-invalid-signature',
  'token-not-active-yet',
  'token-iat-in-the-future',
  'token-verification-failed',
  'secret-key-invalid',
  'jwk-local-missing',
  'jwk-remote-failed-to-load',
  'jwk-remote-invalid',
  'jwk-remote-missing',
  'jwk-failed-to-resolve',
  'jwk-kid-mismatch',
  ...[
    'non-eligible-no-refresh-cookie',
    'non-eligible-non-get',
    'invalid-session-token',
    'missing-api-client',
    'missing-session-token',
    'missing-refresh-token',
    'expired-session-token-decode-failed',
    'expired-session-token-missing-sid-claim',
    'fetch-error',
    'unexpected-sdk-error',
    'unexpected-bapi-error',
    'null',
  ].map((refreshError) => `session-token-expired-refresh-${refreshError}`),
]);

export function decision(value: string | undefined): string | undefined {
  // Clerk's decision is a name, never its arbitrary error message.
  return value !== undefined && CLERK_DECISIONS.has(value) ? value : undefined;
}

/** A value in a decision field that is not one of Clerk's names, as its length. */
export function undecided(label: string, value: string | undefined): string {
  return value === undefined || decision(value)
    ? ''
    : ` ${label} length=${value.length}`;
}

export function describeFailedRequest(
  request: RequestDetails & { failure: string },
): string {
  const failure = /^net::ERR_[A-Z0-9_]+$/.test(request.failure)
    ? request.failure
    : `[redacted ${request.failure.length} chars]`;
  return redactSensitiveE2EText(
    `requestfailed ${request.method} ${requestPlace(request.url)} ${flags(request)} failure=${failure}; cookies unavailable (failed-request headers may be provisional; not evidence of missing cookies)`,
  );
}

export function describeFetchAnswer(
  answer: RequestDetails & {
    status: number;
    responseHeaders: Record<string, string>;
  },
): string | null {
  if (!('next-action' in answer.headers) && !('rsc' in answer.headers))
    return null;
  let text = `${answer.method} ${requestPlace(answer.url)} ${answer.status} ${flags(answer)}`;
  const location = answer.responseHeaders.location;
  if (answer.status >= 300 && answer.status < 400 && location) {
    const target = new URL(location, answer.url);
    if (target.origin !== new URL(answer.url).origin)
      text += ` redirect-host=${target.host}`;
  }
  const rawStatus = answer.responseHeaders['x-clerk-auth-status'];
  const rawReason = answer.responseHeaders['x-clerk-auth-reason'];
  const status = decision(rawStatus);
  const reason = decision(rawReason);
  if (status) text += ` auth=${status}`;
  text += undecided('auth', rawStatus);
  if (reason) text += ` reason=${reason}`;
  text += undecided('reason', rawReason);
  text += `; request cookies (response observed): ${cookieLengths(answer.headers.cookie)}`;
  return redactSensitiveE2EText(text);
}
