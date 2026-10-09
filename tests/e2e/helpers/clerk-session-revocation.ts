import { CLERK_API_BASE, fetchClerkWithRetry } from './credential-health-check';

type FetchClerk = (url: string, init: RequestInit) => Promise<Response>;

/**
 * BUG-330: ends the stored E2E session through Clerk's Backend API by its ID.
 * A browser restoring the stored state can see no session while Clerk still
 * holds it active, so a sign-out through the browser would skip it and leave
 * it live for a week. Only an active session can be revoked; one that had
 * already ended needs nothing. Errors name HTTP statuses only.
 */
export async function revokeClerkE2ESession(input: {
  sessionId: string;
  secretKey: string;
  fetchClerk?: FetchClerk;
}): Promise<'revoked' | 'already_ended'> {
  const fetchClerk = input.fetchClerk ?? fetchClerkWithRetry;
  const headers = { Authorization: `Bearer ${input.secretKey}` };
  const session = `${CLERK_API_BASE}/sessions/${encodeURIComponent(input.sessionId)}`;

  const revocation = await fetchClerk(`${session}/revoke`, {
    method: 'POST',
    headers,
  });
  await revocation.body?.cancel();
  if (revocation.ok) return 'revoked';

  const read = await fetchClerk(session, { headers });
  if (!read.ok) {
    await read.body?.cancel();
    throw new Error(
      `Clerk did not revoke the stored E2E session: it answered ${revocation.status}, and the session could not be read`,
    );
  }
  const { status } = (await read.json()) as { status?: unknown };
  // A pending session is live too, awaiting a second factor.
  if (status !== 'active' && status !== 'pending') return 'already_ended';
  throw new Error(
    `Clerk did not revoke the stored E2E session: it answered ${revocation.status}, and the session is still ${status}`,
  );
}
