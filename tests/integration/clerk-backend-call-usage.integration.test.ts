import { randomUUID } from 'node:crypto';
import { asc, sql as drizzleSql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { clerkBackendCallUsage } from '@/db/schema';
import {
  CLERK_BACKEND_CALL_USAGE_LOCK,
  clerkBackendCallUsageRollUps,
} from '@/src/adapters/jobs/clerk-backend-call-usage';
import {
  CLERK_BACKEND_CALL_USAGE_BUCKETS,
  clerkBackendCallKeys,
} from '@/src/adapters/shared/clerk-backend-call-keys';
import {
  ONE_MINUTE_MS,
  RATE_LIMIT_WINDOW_RETENTION_TARGET_MS,
} from '@/src/adapters/shared/rate-limits';
import { closeConnection, createIntegrationDb } from './helpers';

const { db, sql } = createIntegrationDb();
const KEPT_MINUTES = RATE_LIMIT_WINDOW_RETENTION_TARGET_MS / ONE_MINUTE_MS;
// A period with no earlier row: from the oldest minute the limiter keeps, up
// to the minute before the one still open.
const LONGEST_PERIOD_MS = RATE_LIMIT_WINDOW_RETENTION_TARGET_MS - ONE_MINUTE_MS;

// Each test rolls up under a namespace of its own, put in front of both the
// production buckets and the keys the real builders make. Matching is by
// equality or prefix, so a shared prefix changes no key's bucket, and counters
// other runs leave in this database never enter the totals.
const namespaces: string[] = [];
function namespace() {
  const value = `it-usage-${randomUUID()}|`;
  namespaces.push(value);
  return {
    buckets: CLERK_BACKEND_CALL_USAGE_BUCKETS.map((bucket) => ({
      ...bucket,
      bucket: `${value}${bucket.bucket}`,
      match: `${value}${bucket.match}`,
    })),
    bucket: (bucket: string) => `${value}${bucket}`,
    key: (key: string) => `${value}${key}`,
    async usage() {
      const rows = await db
        .select()
        .from(clerkBackendCallUsage)
        .where(
          drizzleSql`starts_with(${clerkBackendCallUsage.bucket}, ${value})`,
        )
        .orderBy(
          asc(clerkBackendCallUsage.bucket),
          asc(clerkBackendCallUsage.periodStart),
        );
      return rows.map((row) => ({
        ...row,
        bucket: row.bucket.slice(value.length),
      }));
    },
  };
}

// A counter for the clock minute this many minutes before the database's
// current one, as the limiter writes it. Returns the minute it counts.
async function countWindow(
  key: string,
  minutesAgo: number,
  count: number,
): Promise<{ windowStart: Date; count: number }> {
  const [row] = await db.execute<{ window_start: string }>(drizzleSql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (
      ${key},
      date_trunc('minute', now()) - make_interval(mins => ${minutesAgo}),
      ${count}
    )
    RETURNING window_start
  `);
  return { windowStart: new Date(row?.window_start ?? Number.NaN), count };
}

// The database's current clock minute.
async function databaseMinute(): Promise<number> {
  const [row] = await db.execute<{ minute: string }>(
    drizzleSql`SELECT date_trunc('minute', now()) AS minute`,
  );
  return new Date(row?.minute ?? Number.NaN).getTime();
}

// The counts a period [start, end) takes in.
function countedIn(
  period: { periodStart: Date; periodEnd: Date },
  counters: readonly { windowStart: Date; count: number }[],
) {
  return counters
    .filter(
      ({ windowStart }) =>
        windowStart >= period.periodStart && windowStart < period.periodEnd,
    )
    .reduce((total, { count }) => total + count, 0);
}

// A row as an earlier roll-up left it, ending this long before the
// database's current minute.
async function previousRollUp(bucket: string, endedAgo: string) {
  const [previous] = await db
    .insert(clerkBackendCallUsage)
    .values({
      bucket,
      periodStart: drizzleSql`date_trunc('minute', now()) - ${endedAgo}::interval - interval '1 hour'`,
      periodEnd: drizzleSql`date_trunc('minute', now()) - ${endedAgo}::interval`,
      perMinuteLimit: 6,
      counted: 0,
      busiestMinute: 0,
      windowsOverLimit: 0,
      countedOverLimit: 0,
    })
    .returning();
  if (!previous) throw new Error('previous roll-up not written');
  return previous;
}

afterEach(async () => {
  for (const value of namespaces.splice(0)) {
    await db.execute(
      drizzleSql`DELETE FROM rate_limits WHERE starts_with(key, ${value})`,
    );
    await db.execute(
      drizzleSql`DELETE FROM clerk_backend_call_usage WHERE starts_with(bucket, ${value})`,
    );
  }
});

afterAll(async () => {
  await closeConnection(sql);
});

// DEBT-503 item 4, step 1: the renewal job's daily roll-up of the Clerk
// limiter's per-minute counters, on real Postgres.
describe('the Clerk backend-call usage roll-up on Postgres', () => {
  it("rolls the past day of each bucket's counters into one row per bucket, with no address or session in it", async () => {
    const run = namespace();
    await countWindow(run.key(clerkBackendCallKeys.site), 2, 40);
    await countWindow(run.key(clerkBackendCallKeys.site), 30, 1_200);
    await countWindow(
      run.key(clerkBackendCallKeys.signedInSession('sess_a')),
      5,
      8,
    );
    await countWindow(
      run.key(clerkBackendCallKeys.signedInSession('sess_b')),
      5,
      3,
    );
    await countWindow(
      run.key(clerkBackendCallKeys.signedInAddress('203.0.113.7')),
      5,
      11,
    );
    await countWindow(run.key(clerkBackendCallKeys.session('sess_c')), 10, 4);
    await countWindow(
      run.key(clerkBackendCallKeys.address('203.0.113.7')),
      10,
      35,
    );
    await countWindow(
      run.key(clerkBackendCallKeys.address('2001:db8::7')),
      20,
      30,
    );
    await countWindow(run.key(clerkBackendCallKeys.callFailed), 15, 12);

    const written = await clerkBackendCallUsageRollUps({
      db,
      buckets: run.buckets,
    }).rollUp();

    const usage = await run.usage();
    expect(written).toBe(CLERK_BACKEND_CALL_USAGE_BUCKETS.length);
    expect(
      usage.map(
        ({
          bucket,
          perMinuteLimit,
          counted,
          busiestMinute,
          windowsOverLimit,
          countedOverLimit,
        }) => ({
          bucket,
          perMinuteLimit,
          counted,
          busiestMinute,
          windowsOverLimit,
          countedOverLimit,
        }),
      ),
    ).toEqual([
      {
        bucket: 'address',
        perMinuteLimit: 30,
        counted: 65,
        busiestMinute: 35,
        windowsOverLimit: 1,
        countedOverLimit: 5,
      },
      {
        bucket: 'call-failed',
        perMinuteLimit: 10,
        counted: 12,
        busiestMinute: 12,
        windowsOverLimit: 1,
        countedOverLimit: 2,
      },
      {
        bucket: 'session',
        perMinuteLimit: 6,
        counted: 4,
        busiestMinute: 4,
        windowsOverLimit: 0,
        countedOverLimit: 0,
      },
      {
        bucket: 'signed-in-address',
        perMinuteLimit: 200,
        counted: 11,
        busiestMinute: 11,
        windowsOverLimit: 0,
        countedOverLimit: 0,
      },
      {
        bucket: 'signed-in-session',
        perMinuteLimit: 6,
        counted: 11,
        busiestMinute: 8,
        windowsOverLimit: 1,
        countedOverLimit: 2,
      },
      {
        bucket: 'site',
        perMinuteLimit: 1_000,
        counted: 1_240,
        busiestMinute: 1_200,
        windowsOverLimit: 1,
        countedOverLimit: 200,
      },
      {
        bucket: 'token-rejected',
        perMinuteLimit: 3,
        counted: 0,
        busiestMinute: 0,
        windowsOverLimit: 0,
        countedOverLimit: 0,
      },
    ]);
    for (const row of usage) {
      expect(row.periodEnd.getTime() - row.periodStart.getTime()).toBe(
        LONGEST_PERIOD_MS,
      );
    }
  });

  it('takes in only the minutes the limiter still keeps, and none still settling', async () => {
    const run = namespace();
    const session = run.key(clerkBackendCallKeys.session('sess_a'));
    const before = await databaseMinute();
    const counters = [
      await countWindow(session, KEPT_MINUTES + 10, 50),
      await countWindow(session, KEPT_MINUTES - 10, 2),
      await countWindow(session, 2, 3),
      await countWindow(session, 1, 5),
      await countWindow(session, 0, 7),
      await countWindow(session, -1, 70),
    ];

    await clerkBackendCallUsageRollUps({ db, buckets: run.buckets }).rollUp();
    const after = await databaseMinute();

    const [row] = (await run.usage()).filter(
      ({ bucket }) => bucket === 'session',
    );
    if (!row) throw new Error('no session row');
    // The period ends a minute before the one the roll-up ran in, which lies
    // between the two readings: exactly that minute when they agree.
    expect(row.periodEnd.getTime()).toBeGreaterThanOrEqual(
      before - ONE_MINUTE_MS,
    );
    expect(row.periodEnd.getTime()).toBeLessThanOrEqual(after - ONE_MINUTE_MS);
    expect(row.periodEnd.getTime() - row.periodStart.getTime()).toBe(
      LONGEST_PERIOD_MS,
    );
    expect(row.counted).toBe(countedIn(row, counters));
  });

  it('starts each bucket where its previous row ended, its first minute included', async () => {
    const run = namespace();
    const previous = await previousRollUp(run.bucket('session'), '1 hour');
    const session = run.key(clerkBackendCallKeys.session('sess_a'));
    await countWindow(session, 61, 5);
    await countWindow(session, 60, 2);
    await countWindow(session, 30, 3);

    await clerkBackendCallUsageRollUps({ db, buckets: run.buckets }).rollUp();

    const rows = (await run.usage()).filter(
      ({ bucket }) => bucket === 'session',
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]?.periodStart).toEqual(previous.periodEnd);
    expect(rows[1]).toMatchObject({ counted: 5 });
  });

  it('starts no further back than the limiter keeps, however old the previous row', async () => {
    const run = namespace();
    await previousRollUp(run.bucket('session'), '2 days');
    const session = run.key(clerkBackendCallKeys.session('sess_a'));
    await countWindow(session, KEPT_MINUTES + 30, 5);
    await countWindow(session, 30, 3);

    await clerkBackendCallUsageRollUps({ db, buckets: run.buckets }).rollUp();

    const rows = (await run.usage()).filter(
      ({ bucket }) => bucket === 'session',
    );
    expect(rows).toHaveLength(2);
    expect(
      (rows[1]?.periodEnd.getTime() ?? 0) -
        (rows[1]?.periodStart.getTime() ?? 0),
    ).toBe(LONGEST_PERIOD_MS);
    expect(rows[1]).toMatchObject({ counted: 3 });
  });

  it('waits for a roll-up already running, so the two never overlap', async () => {
    const run = namespace();
    await countWindow(run.key(clerkBackendCallKeys.site), 3, 40);
    const holder = createIntegrationDb();
    const waiter = createIntegrationDb();
    let waiting: Promise<number> | undefined;
    try {
      await holder.sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtext(${CLERK_BACKEND_CALL_USAGE_LOCK}), 0)`;
        waiting = clerkBackendCallUsageRollUps({
          db: waiter.db,
          buckets: run.buckets,
        }).rollUp();
        await new Promise((resolve) => setTimeout(resolve, 300));

        await expect(run.usage()).resolves.toEqual([]);
      });

      await expect(waiting).resolves.toBe(
        CLERK_BACKEND_CALL_USAGE_BUCKETS.length,
      );
    } finally {
      await closeConnection(holder.sql);
      await closeConnection(waiter.sql);
    }
  });

  it('counts each counter once across concurrent roll-ups, each on its own connection', async () => {
    const run = namespace();
    await countWindow(run.key(clerkBackendCallKeys.site), 3, 40);
    await countWindow(run.key(clerkBackendCallKeys.site), 4, 50);
    const sessions = Array.from({ length: 6 }, () => createIntegrationDb());
    try {
      await Promise.all(sessions.map((session) => session.sql`select 1`));

      await Promise.all(
        sessions.map((session) =>
          clerkBackendCallUsageRollUps({
            db: session.db,
            buckets: run.buckets,
          }).rollUp(),
        ),
      );
    } finally {
      await Promise.all(
        sessions.map((session) => closeConnection(session.sql)),
      );
    }

    const rows = (await run.usage()).filter(({ bucket }) => bucket === 'site');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.reduce((total, row) => total + row.counted, 0)).toBe(90);
    for (const [index, row] of rows.slice(1).entries()) {
      expect(row.periodStart).toEqual(rows[index]?.periodEnd);
    }
  });
});
