import { createHash, randomUUID } from 'node:crypto';
import { and, gte, inArray } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { rateLimits } from '@/db/schema';
import { limitClerkBackendCalls } from '@/lib/clerk-backend-call-limit';
import { DrizzleRateLimiter } from '@/src/adapters/gateways/drizzle-rate-limiter';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();
const limiter = new DrizzleRateLimiter(db);

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});
afterAll(async () => {
  await closeConnection(sql);
});

// An expired session token as a sender can forge it: Clerk would reject its
// signature, but the proxy counts the request before Clerk sees it.
function forgedSessionToken(sid: string): string {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part({ exp: 1, sid })}.signature`;
}

// A request that makes Clerk call its Backend API: a handshake nonce, which
// costs Clerk a lookup, beside an expired session token and a refresh cookie.
function handshakeWithSession(sid: string, address: string): NextRequest {
  const request = new NextRequest(
    'https://example.com/pricing?__clerk_handshake_nonce=nonce',
    {
      headers: {
        cookie: `__session=${forgedSessionToken(sid)}; __refresh_abc=x`,
      },
    },
  );
  // The header Vercel sets in production, which getClientIp reads first.
  request.headers.set('x-vercel-forwarded-for', address);
  return request;
}

// The limiter's own rows for an address, in the minute just counted.
async function countedSince(address: string, sessionKey: string, since: Date) {
  return db
    .select({ key: rateLimits.key })
    .from(rateLimits)
    .where(
      and(
        gte(rateLimits.windowStart, since),
        inArray(rateLimits.key, [
          `clerk-backend-call:${address}`,
          sessionKey,
          'clerk-backend-call:site',
        ]),
      ),
    );
}

// BUG-372, on BUG-323's limiter: whatever a sender puts in an unverified token, the
// request counts per address, per session and site-wide, on real Postgres.
describe('limiting requests that make Clerk call its Backend API, on Postgres', () => {
  it.each([
    ['longer than a key can hold', 's'.repeat(300)],
    ['holding a character the database refuses', 'sess_a\u0000b'],
  ])(
    'counts a request with a session ID %s, and reports no failure',
    async (_shape, sid) => {
      const address = `2001:db8::${randomUUID().slice(0, 4)}`;
      const sessionKey = `clerk-backend-call:session:sha256:${createHash('sha256').update(sid).digest('base64url')}`;
      cleanup.rateLimitKeys.push(
        `clerk-backend-call:${address}`,
        sessionKey,
        'clerk-backend-call:site',
      );
      const since = new Date(Date.now() - 60_000);
      const failures: unknown[] = [];

      const response = await limitClerkBackendCalls(
        handshakeWithSession(sid, address),
        async () => limiter,
        (failure) => failures.push(failure),
      );

      expect(response).toBeNull();
      expect(failures).toEqual([]);
      expect(
        (await countedSince(address, sessionKey, since))
          .map(({ key }) => key)
          .sort(),
      ).toEqual(
        [
          `clerk-backend-call:${address}`,
          sessionKey,
          'clerk-backend-call:site',
        ].sort(),
      );
    },
  );
});
