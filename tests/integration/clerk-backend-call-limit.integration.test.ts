import { createHash, randomUUID } from 'node:crypto';
import { and, sql as drizzleSql, eq, gte, inArray, lte } from 'drizzle-orm';
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

const SITE_KEY = 'clerk-backend-call:site';
// The site counter is shared with every other request, so a test gives back
// only the counts it added, by window, instead of deleting the counter.
const siteCountsToGiveBack: Date[] = [];

afterEach(async () => {
  for (const windowStart of siteCountsToGiveBack.splice(0)) {
    const where = and(
      eq(rateLimits.key, SITE_KEY),
      eq(rateLimits.windowStart, windowStart),
    );
    await db
      .update(rateLimits)
      .set({ count: drizzleSql`${rateLimits.count} - 1` })
      .where(where);
    await db.delete(rateLimits).where(and(where, lte(rateLimits.count, 0)));
  }
  await cleanupAfterEach(db, cleanup);
});

// The site counter's count in each window from `since`.
async function siteWindowsSince(since: Date) {
  const rows = await db
    .select({ windowStart: rateLimits.windowStart, count: rateLimits.count })
    .from(rateLimits)
    .where(
      and(eq(rateLimits.key, SITE_KEY), gte(rateLimits.windowStart, since)),
    );
  return new Map(rows.map((row) => [row.windowStart.getTime(), row.count]));
}
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

// Each key's count over the past hour, which no prune reaches: a counter is
// pruned only a day after its window started.
async function countsSince(keys: readonly string[], since: Date) {
  const rows = await db
    .select({
      key: rateLimits.key,
      total: drizzleSql<number>`sum(${rateLimits.count})::int`,
    })
    .from(rateLimits)
    .where(
      and(
        gte(rateLimits.windowStart, since),
        inArray(rateLimits.key, [...keys]),
      ),
    )
    .groupBy(rateLimits.key);
  return Object.fromEntries(
    keys.map((key) => [key, rows.find((row) => row.key === key)?.total ?? 0]),
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
      const ownKeys = [
        `clerk-backend-call:${address}`,
        `clerk-backend-call:session:sha256:${createHash('sha256').update(sid).digest('base64url')}`,
      ];
      const keys = [...ownKeys, SITE_KEY];
      cleanup.rateLimitKeys.push(...ownKeys);
      const since = new Date(Date.now() - 60 * 60_000);
      const before = await countsSince(keys, since);
      const siteBefore = await siteWindowsSince(since);
      const failures: unknown[] = [];

      const response = await limitClerkBackendCalls(
        handshakeWithSession(sid, address),
        async () => limiter,
        (failure) => failures.push(failure),
      );

      const siteAfter = await siteWindowsSince(since);
      for (const [windowStart, count] of siteAfter) {
        if (count > (siteBefore.get(windowStart) ?? 0))
          siteCountsToGiveBack.push(new Date(windowStart));
      }
      expect(response).toBeNull();
      expect(failures).toEqual([]);
      await expect(countsSince(keys, since)).resolves.toEqual(
        Object.fromEntries(keys.map((key) => [key, (before[key] ?? 0) + 1])),
      );
    },
  );
});
