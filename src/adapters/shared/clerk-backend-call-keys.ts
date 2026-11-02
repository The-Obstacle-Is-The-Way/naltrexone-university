import {
  CLERK_BACKEND_CALL_FAILURE_ALERT_THRESHOLD,
  CLERK_BACKEND_CALL_RATE_LIMIT,
  CLERK_BACKEND_CALL_SESSION_RATE_LIMIT,
  CLERK_BACKEND_CALL_SIGNED_IN_RATE_LIMIT,
  CLERK_BACKEND_CALL_SITE_RATE_LIMIT,
  CLERK_SESSION_TOKEN_REJECTED_ALERT_THRESHOLD,
} from './rate-limits';

// The limiter keys of the requests that make Clerk call its Backend API
// (BUG-323, DEBT-503), and of the failures counted for item 3's alerts.
export const clerkBackendCallKeys = {
  address: (address: string) => `clerk-backend-call:${address}`,
  session: (sessionId: string) => `clerk-backend-call:session:${sessionId}`,
  signedInAddress: (address: string) =>
    `clerk-backend-call:signed-in:${address}`,
  signedInSession: (sessionId: string) =>
    `clerk-backend-call:signed-in-session:${sessionId}`,
  site: 'clerk-backend-call:site',
  callFailed: 'clerk-backend-call-failed:site',
  tokenRejected: 'clerk-session-token-rejected:site',
} as const;

export type ClerkBackendCallUsageBucket = {
  bucket: string;
  /** A key equal to this belongs to the bucket, or one starting with it when `prefix` is set. */
  match: string;
  prefix: boolean;
  perMinuteLimit: number;
};

// DEBT-503 item 4, step 1: the buckets the renewal job rolls the limiter's
// per-minute counters up into, with no address or session in them. A key
// belongs to the first bucket it matches, so the address bucket, whose
// prefix every other request key shares, comes after them.
export const CLERK_BACKEND_CALL_USAGE_BUCKETS: readonly ClerkBackendCallUsageBucket[] =
  [
    {
      bucket: 'site',
      match: clerkBackendCallKeys.site,
      prefix: false,
      perMinuteLimit: CLERK_BACKEND_CALL_SITE_RATE_LIMIT.limit,
    },
    {
      bucket: 'signed-in-session',
      match: clerkBackendCallKeys.signedInSession(''),
      prefix: true,
      perMinuteLimit: CLERK_BACKEND_CALL_SESSION_RATE_LIMIT.limit,
    },
    {
      bucket: 'signed-in-address',
      match: clerkBackendCallKeys.signedInAddress(''),
      prefix: true,
      perMinuteLimit: CLERK_BACKEND_CALL_SIGNED_IN_RATE_LIMIT.limit,
    },
    {
      bucket: 'session',
      match: clerkBackendCallKeys.session(''),
      prefix: true,
      perMinuteLimit: CLERK_BACKEND_CALL_SESSION_RATE_LIMIT.limit,
    },
    {
      bucket: 'address',
      match: clerkBackendCallKeys.address(''),
      prefix: true,
      perMinuteLimit: CLERK_BACKEND_CALL_RATE_LIMIT.limit,
    },
    {
      bucket: 'call-failed',
      match: clerkBackendCallKeys.callFailed,
      prefix: false,
      perMinuteLimit: CLERK_BACKEND_CALL_FAILURE_ALERT_THRESHOLD.limit,
    },
    {
      bucket: 'token-rejected',
      match: clerkBackendCallKeys.tokenRejected,
      prefix: false,
      perMinuteLimit: CLERK_SESSION_TOKEN_REJECTED_ALERT_THRESHOLD.limit,
    },
  ];
