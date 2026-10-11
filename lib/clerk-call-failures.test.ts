import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLERK_BACKEND_CALL_FAILURE_ALERT_THRESHOLD,
  CLERK_SESSION_TOKEN_REJECTED_ALERT_THRESHOLD,
} from '@/src/adapters/shared/rate-limits';
import {
  FakeOperationalAlerts,
  FakeRateLimiter,
} from '@/src/application/test-helpers/fakes';
import {
  clerkCallFailure,
  reportClerkCallFailure,
} from './clerk-call-failures';

const OVER_THRESHOLD = {
  success: false,
  limit: CLERK_BACKEND_CALL_FAILURE_ALERT_THRESHOLD.limit,
  remaining: 0,
  retryAfterSeconds: 30,
};

function answer(reason?: string, init: { setCookie?: string } = {}) {
  const headers = new Headers();
  if (reason) headers.set('x-clerk-auth-reason', reason);
  if (init.setCookie) headers.append('set-cookie', init.setCookie);
  return new Response(null, { status: 200, headers });
}

function request(url = 'https://example.com/app/dashboard') {
  return new NextRequest(url);
}

// DEBT-503 item 3: Clerk's middleware swallows Clerk's refusal of its own
// calls, and says why only in its auth reason.
describe('clerkCallFailure', () => {
  it('names a signing-key fetch that failed, which signs every visitor out', () => {
    expect(
      clerkCallFailure(request(), answer('jwk-remote-failed-to-load')),
    ).toBe('keys');
  });

  it.each(['too_many_requests', 'unexpected-bapi-error', 'fetch-error'])(
    'names a refresh Clerk answered with a failure (%s)',
    (code) => {
      expect(
        clerkCallFailure(
          request(),
          answer(`session-token-expired-refresh-${code}`),
        ),
      ).toBe('refresh');
    },
  );

  it.each([
    'non-eligible-no-refresh-cookie',
    'non-eligible-non-get',
    'invalid-session-token',
    'missing-api-client',
    'missing-session-token',
    'missing-refresh-token',
    'expired-session-token-decode-failed',
    'expired-session-token-missing-sid-claim',
    'unexpected-sdk-error',
  ])(
    'ignores a refresh that failed without a failing answer from Clerk (%s)',
    (reason) => {
      expect(
        clerkCallFailure(
          request(),
          answer(`session-token-expired-refresh-${reason}`),
        ),
      ).toBeNull();
    },
  );

  it('names a handshake nonce whose lookup set no cookies', () => {
    expect(
      clerkCallFailure(
        request('https://example.com/app/dashboard?__clerk_handshake_nonce=n'),
        answer('session-token-missing'),
      ),
    ).toBe('handshake');
  });

  it('ignores a handshake nonce whose lookup set cookies', () => {
    expect(
      clerkCallFailure(
        request('https://example.com/app/dashboard?__clerk_handshake_nonce=n'),
        answer('session-token-missing', {
          setCookie: '__client_uat=0; Path=/',
        }),
      ),
    ).toBeNull();
  });

  it('ignores a missing session token without a handshake nonce', () => {
    expect(
      clerkCallFailure(request(), answer('session-token-missing')),
    ).toBeNull();
  });

  // DEBT-503 item 5: a configured key that is not Clerk's rejects every token.
  it('names a session token whose signature failed', () => {
    expect(clerkCallFailure(request(), answer('token-invalid-signature'))).toBe(
      'signature',
    );
  });

  it('ignores an answer with no failure', () => {
    expect(clerkCallFailure(request(), answer())).toBeNull();
    expect(
      clerkCallFailure(request(), answer('session-token-outdated')),
    ).toBeNull();
  });
});

describe('reportClerkCallFailure', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function report(
    failure: Parameters<typeof reportClerkCallFailure>[0],
    limiter = new FakeRateLimiter(),
  ) {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errored = vi.spyOn(console, 'error').mockImplementation(() => {});
    const alerts = new FakeOperationalAlerts();
    const done = reportClerkCallFailure(failure, {
      loadLimiter: async () => limiter,
      loadAlerts: async () => alerts,
    });
    return { done, alerts, limiter, warned, errored };
  }

  it('logs the call and alerts at once, under its own kind, when the signing keys failed', async () => {
    const { done, alerts, limiter, warned } = report('keys');

    await done;

    expect(warned).toHaveBeenCalledWith({
      event: 'clerk_backend_call_failed',
      call: 'keys',
    });
    expect(alerts.raised).toEqual([
      { kind: 'clerk_signing_keys_unavailable', count: 1 },
    ]);
    expect(limiter.inputs).toEqual([]);
  });

  it('counts a failed refresh, and raises nothing under the threshold', async () => {
    const { done, alerts, limiter, warned } = report('refresh');

    await done;

    expect(warned).toHaveBeenCalledWith({
      event: 'clerk_backend_call_failed',
      call: 'refresh',
    });
    expect(limiter.inputs).toEqual([
      {
        key: 'clerk-backend-call-failed:site',
        ...CLERK_BACKEND_CALL_FAILURE_ALERT_THRESHOLD,
      },
    ]);
    expect(alerts.raised).toEqual([]);
  });

  it('alerts once failed refreshes and nonce lookups pass the threshold', async () => {
    const { done, alerts } = report(
      'handshake',
      new FakeRateLimiter([OVER_THRESHOLD]),
    );

    await done;

    expect(alerts.raised).toEqual([
      { kind: 'clerk_backend_calls_refused', count: 1 },
    ]);
  });

  it('counts rejected signatures apart, and raises their own alert past the threshold', async () => {
    const limiter = new FakeRateLimiter([OVER_THRESHOLD]);
    const { done, alerts, warned } = report('signature', limiter);

    await done;

    expect(warned).toHaveBeenCalledWith({
      event: 'clerk_session_token_rejected',
    });
    expect(limiter.inputs).toEqual([
      {
        key: 'clerk-session-token-rejected:site',
        ...CLERK_SESSION_TOKEN_REJECTED_ALERT_THRESHOLD,
      },
    ]);
    expect(alerts.raised).toEqual([
      { kind: 'clerk_session_tokens_rejected', count: 1 },
    ]);
  });

  it('logs a failing count and never rejects', async () => {
    const { done, alerts, errored } = report(
      'refresh',
      new FakeRateLimiter(new Error('database unavailable')),
    );

    await expect(done).resolves.toBeUndefined();
    expect(errored).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'clerk_backend_call_failure_count_unavailable',
      }),
    );
    expect(alerts.raised).toEqual([]);
  });
});
