import { describe, expect, it } from 'vitest';
import {
  CLERK_BACKEND_CALL_USAGE_BUCKETS,
  type ClerkBackendCallUsageBucket,
  clerkBackendCallKeys,
} from './clerk-backend-call-keys';
import {
  CLERK_BACKEND_CALL_FAILURE_ALERT_THRESHOLD,
  CLERK_BACKEND_CALL_RATE_LIMIT,
  CLERK_BACKEND_CALL_SESSION_RATE_LIMIT,
  CLERK_BACKEND_CALL_SIGNED_IN_RATE_LIMIT,
  CLERK_BACKEND_CALL_SITE_RATE_LIMIT,
  CLERK_SESSION_TOKEN_REJECTED_ALERT_THRESHOLD,
} from './rate-limits';

// The roll-up's rule, which its SQL applies: a key belongs to the first
// bucket it equals, or starts with when the bucket matches a prefix.
function bucketOf(
  key: string,
  buckets: readonly ClerkBackendCallUsageBucket[],
): string | undefined {
  return buckets.find(({ match, prefix }) =>
    prefix ? key.startsWith(match) : key === match,
  )?.bucket;
}

// DEBT-503 item 4, step 1: the renewal job rolls the limiter's counters up
// by bucket, so every key the limiter writes must land in its own bucket.
describe('the Clerk backend-call usage buckets', () => {
  // Typed by the builders, so a new limiter key cannot go without a bucket
  // and fall into the address bucket, whose prefix it would share.
  const bucketOfBuilder: Record<keyof typeof clerkBackendCallKeys, string> = {
    address: 'address',
    session: 'session',
    signedInAddress: 'signed-in-address',
    signedInSession: 'signed-in-session',
    site: 'site',
    callFailed: 'call-failed',
    tokenRejected: 'token-rejected',
  };

  it.each(
    Object.entries(clerkBackendCallKeys).flatMap(([builder, build]) =>
      (typeof build === 'string'
        ? [build]
        : ['203.0.113.7', '2001:db8::7', 'sess_a'].map((id) => build(id))
      ).map((key) => ({ builder, key })),
    ),
  )(
    "rolls $key, from the $builder builder, up into that builder's bucket",
    ({ builder, key }) => {
      expect(bucketOf(key, CLERK_BACKEND_CALL_USAGE_BUCKETS)).toBe(
        bucketOfBuilder[builder as keyof typeof clerkBackendCallKeys],
      );
    },
  );

  it('rolls up no other key', () => {
    expect(
      bucketOf('cron:send-renewal-notices', CLERK_BACKEND_CALL_USAGE_BUCKETS),
    ).toBeUndefined();
  });

  it('records each bucket against the limit its counter is checked with', () => {
    const limits = Object.fromEntries(
      CLERK_BACKEND_CALL_USAGE_BUCKETS.map(({ bucket, perMinuteLimit }) => [
        bucket,
        perMinuteLimit,
      ]),
    );

    expect(limits).toEqual({
      site: CLERK_BACKEND_CALL_SITE_RATE_LIMIT.limit,
      'signed-in-session': CLERK_BACKEND_CALL_SESSION_RATE_LIMIT.limit,
      'signed-in-address': CLERK_BACKEND_CALL_SIGNED_IN_RATE_LIMIT.limit,
      session: CLERK_BACKEND_CALL_SESSION_RATE_LIMIT.limit,
      address: CLERK_BACKEND_CALL_RATE_LIMIT.limit,
      'call-failed': CLERK_BACKEND_CALL_FAILURE_ALERT_THRESHOLD.limit,
      'token-rejected': CLERK_SESSION_TOKEN_REJECTED_ALERT_THRESHOLD.limit,
    });
  });
});
