import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { limitClerkBackendCalls } from '@/lib/clerk-backend-call-limit';
import { FakeRateLimiter } from '@/src/application/test-helpers/fakes';

const UNDER_LIMIT = {
  success: true,
  limit: 30,
  remaining: 29,
  retryAfterSeconds: 0,
};

// An expired session token whose payload the proxy reads before Clerk checks
// its signature.
function sessionToken(sid: unknown): string {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part({ exp: 1, sid })}.signature`;
}

function refreshWith(sid: unknown): NextRequest {
  const request = new NextRequest('https://example.com/pricing', {
    headers: { cookie: `__session=${sessionToken(sid)}; __refresh_abc=x` },
  });
  // The header Vercel sets in production, which getClientIp reads first.
  request.headers.set('x-vercel-forwarded-for', '203.0.113.7');
  return request;
}

async function keysFor(sid: unknown): Promise<string[]> {
  const limiter = new FakeRateLimiter([UNDER_LIMIT, UNDER_LIMIT, UNDER_LIMIT]);
  await limitClerkBackendCalls(
    refreshWith(sid),
    async () => limiter,
    () => {},
  );
  return limiter.inputs.map(({ key }) => key);
}

// A token's claims are the sender's until its signature is checked. A session
// ID shaped like Clerk's own keys its session as it is; any other keys it by
// its digest, whose length is fixed and whose form no Clerk ID takes, so the
// key fits the limiter's column and holds nothing the database refuses.
describe('the session ID in the per-session limit key', () => {
  it("keeps a session ID shaped like Clerk's as it is", async () => {
    await expect(keysFor('sess_2b4D9fQx7LmN3pR8sT1vW6yZ0aC')).resolves.toEqual([
      'clerk-backend-call:203.0.113.7',
      'clerk-backend-call:session:sess_2b4D9fQx7LmN3pR8sT1vW6yZ0aC',
      'clerk-backend-call:site',
    ]);
  });

  it("keeps one of the longest IDs shaped like Clerk's as it is", async () => {
    const sid = `sess_${'a'.repeat(59)}`;

    await expect(keysFor(sid)).resolves.toContain(
      `clerk-backend-call:session:${sid}`,
    );
  });

  it.each([[null], [12], [{}]])(
    'keys a session ID that is not a string, %j, as unknown',
    async (sid) => {
      await expect(keysFor(sid)).resolves.toContain(
        'clerk-backend-call:session:unknown',
      );
    },
  );

  it.each([
    ["one character longer than Clerk's shape", `sess_${'a'.repeat(60)}`],
    ['longer than a key can hold', 's'.repeat(300)],
    ['holding a character the database refuses', 'sess_a\u0000b'],
    ['in the digest form itself', 'sha256:abc'],
  ])('keys a session ID %s by its digest', async (_shape, sid) => {
    await expect(keysFor(sid)).resolves.toEqual([
      'clerk-backend-call:203.0.113.7',
      `clerk-backend-call:session:sha256:${createHash('sha256').update(sid).digest('base64url')}`,
      'clerk-backend-call:site',
    ]);
  });
});
