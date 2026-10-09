import { describe, expect, it } from 'vitest';
import { revokeClerkE2ESession } from './clerk-session-revocation';
import { CLERK_API_BASE } from './credential-health-check';

// BUG-330: teardown ends the stored session through Clerk's Backend API by
// its ID, whatever a browser can see. Shape only: the answers are Clerk's
// documented responses.
type Call = { url: string; method: string; authorization: string | null };

function clerkApi(answers: Record<string, Response>) {
  const calls: Call[] = [];
  const fetchClerk = async (url: string, init: RequestInit) => {
    const method = init.method ?? 'GET';
    calls.push({
      url,
      method,
      authorization: new Headers(init.headers).get('authorization'),
    });
    return answers[`${method} ${url}`] ?? new Response(null, { status: 500 });
  };
  return { calls, fetchClerk };
}

const SESSION = `${CLERK_API_BASE}/sessions/sess_e2e`;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe('revokeClerkE2ESession', () => {
  it('revokes the session by its ID with the secret key', async () => {
    const { calls, fetchClerk } = clerkApi({
      [`POST ${SESSION}/revoke`]: json({ id: 'sess_e2e', status: 'revoked' }),
    });

    await expect(
      revokeClerkE2ESession({
        sessionId: 'sess_e2e',
        secretKey: 'sk_test_key',
        fetchClerk,
      }),
    ).resolves.toBe('revoked');

    expect(calls).toEqual([
      {
        url: `${SESSION}/revoke`,
        method: 'POST',
        authorization: 'Bearer sk_test_key',
      },
    ]);
  });

  // Only an active session can be revoked.
  it('accepts a session that had already ended', async () => {
    const { fetchClerk } = clerkApi({
      [`POST ${SESSION}/revoke`]: json({ errors: [] }, 400),
      [`GET ${SESSION}`]: json({ id: 'sess_e2e', status: 'expired' }),
    });

    await expect(
      revokeClerkE2ESession({
        sessionId: 'sess_e2e',
        secretKey: 'sk_test_key',
        fetchClerk,
      }),
    ).resolves.toBe('already_ended');
  });

  it('fails, naming the status only, when a still-active session was not revoked', async () => {
    const { fetchClerk } = clerkApi({
      [`POST ${SESSION}/revoke`]: json({ errors: [] }, 503),
      [`GET ${SESSION}`]: json({ id: 'sess_e2e', status: 'active' }),
    });

    await expect(
      revokeClerkE2ESession({
        sessionId: 'sess_e2e',
        secretKey: 'sk_test_key',
        fetchClerk,
      }),
    ).rejects.toThrow(
      'Clerk did not revoke the stored E2E session: it answered 503, and the session is still active',
    );
  });

  it('fails when neither the revocation nor the session read is answered', async () => {
    const { fetchClerk } = clerkApi({});

    await expect(
      revokeClerkE2ESession({
        sessionId: 'sess_e2e',
        secretKey: 'sk_test_key',
        fetchClerk,
      }),
    ).rejects.toThrow('it answered 500, and the session could not be read');
  });
});
