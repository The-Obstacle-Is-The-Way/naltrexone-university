import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterEach, beforeEach, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { bootstrapRelease } from '@/scripts/content-release/release-activation';
import { stageReleaseFromFiles } from '@/scripts/content-release/release-builder';
import { changeHolds } from '@/scripts/content-release/release-holds';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { runContentWithdrawal } from '@/scripts/seed/withdraw-questions';
import { createDisposableDatabase } from './disposable-database-test-helpers';
import { source } from './seed-test-helpers';

let disposable: Awaited<ReturnType<typeof createDisposableDatabase>>;
beforeEach(async () => {
  disposable = await createDisposableDatabase();
});
afterEach(async () => {
  if (disposable) await disposable.drop();
});
it('allows a hold and overlapping withdrawal batch to finish without deadlock', async () => {
  await syncQuestionsFromFiles(disposable.db, [
    source('audit-low'),
    source('audit-high'),
  ]);
  await bootstrapRelease(disposable.db);
  const monitor = postgres(disposable.url, { max: 1 });
  const holder = postgres(disposable.url, { max: 1 });
  let hold: Promise<unknown> | undefined;
  let withdrawal: Promise<unknown> | undefined;
  try {
    const questions =
      await monitor`SELECT id, slug FROM questions ORDER BY id LIMIT 2`;
    const low = questions[0];
    const high = questions[1];
    if (!low || !high) throw new Error('Missing fixtures');
    await monitor.unsafe(
      `CREATE FUNCTION audit_pause_hold() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(489); RETURN NEW; END $$`,
    );
    await monitor.unsafe(
      `CREATE TRIGGER audit_pause_hold BEFORE INSERT ON question_holds FOR EACH ROW EXECUTE FUNCTION audit_pause_hold()`,
    );
    await monitor`SELECT pg_advisory_lock(489)`;
    const [backend] = await holder`SELECT pg_backend_pid() AS pid`;
    hold = changeHolds(drizzle(holder, { schema }), {
      qids: [high.slug],
      record: { reason: 'Audit hold', authority: 'Audit' },
      lift: false,
    }).then(
      () => 'ok',
      (e) => e,
    );
    await expect
      .poll(async () => {
        const [r] =
          await monitor`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=${backend?.pid} AND locktype='advisory' AND NOT granted) AS waiting`;
        return r?.waiting;
      })
      .toBe(true);
    withdrawal = runContentWithdrawal(
      [
        '--qid',
        low.slug,
        '--qid',
        high.slug,
        '--reason',
        'Audit withdrawal',
        '--authority',
        'Audit',
        '--apply',
      ],
      { env: { DATABASE_URL: disposable.url }, log: () => {} },
    ).then(
      () => 'ok',
      (e) => e,
    );
    await expect
      .poll(async () => {
        const [r] =
          await monitor`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${backend?.pid}=ANY(pg_blocking_pids(pid))) AS waiting`;
        return r?.waiting;
      })
      .toBe(true);
    await monitor`SELECT pg_advisory_unlock(489)`;
    const outcomes = await Promise.all([hold, withdrawal]);
    expect(outcomes).toEqual(['ok', 'ok']);
  } finally {
    await monitor`SELECT pg_advisory_unlock_all()`;
    await Promise.allSettled([hold, withdrawal]);
    await monitor.unsafe(
      'DROP TRIGGER IF EXISTS audit_pause_hold ON question_holds',
    );
    await monitor.unsafe('DROP FUNCTION IF EXISTS audit_pause_hold()');
    await holder.end({ timeout: 5 });
    await monitor.end({ timeout: 5 });
  }
});

it('reuses the release when identical new-only bundles stage concurrently', async () => {
  await bootstrapRelease(disposable.db);
  const monitor = postgres(disposable.url, { max: 1, onnotice: () => {} });
  const first = postgres(disposable.url, { max: 1, onnotice: () => {} });
  const second = postgres(disposable.url, { max: 1, onnotice: () => {} });
  let runs: Promise<unknown>[] = [];
  try {
    await monitor.unsafe(
      'CREATE FUNCTION audit_pause_stage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock_shared(490); RETURN NEW; END $$',
    );
    await monitor.unsafe(
      'CREATE TRIGGER audit_pause_stage BEFORE INSERT ON questions FOR EACH ROW EXECUTE FUNCTION audit_pause_stage()',
    );
    await monitor`SELECT pg_advisory_lock(490)`;
    const [firstBackend] = await first`SELECT pg_backend_pid() AS pid`;
    const [secondBackend] = await second`SELECT pg_backend_pid() AS pid`;
    const stage = (client: typeof first) =>
      stageReleaseFromFiles(drizzle(client, { schema }), [
        source('audit-new'),
      ]).then(
        (result) => result.releaseId,
        (error: unknown) => error,
      );
    runs = [stage(first)];
    await expect
      .poll(async () => {
        const [row] =
          await monitor`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid=${firstBackend?.pid} AND locktype='advisory' AND NOT granted) AS waiting`;
        return row?.waiting;
      })
      .toBe(true);
    runs.push(stage(second));
    // Before the fix this waits on the insert barrier; after it, on the pointer.
    await expect
      .poll(async () => {
        const [row] =
          await monitor`SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=${secondBackend?.pid}`;
        return row?.waiting;
      })
      .toBe(true);
    await monitor`SELECT pg_advisory_unlock(490)`;
    const outcomes = await Promise.all(runs);
    expect(outcomes[0]).toEqual(expect.any(String));
    expect(outcomes[1]).toBe(outcomes[0]);
  } finally {
    await monitor`SELECT pg_advisory_unlock_all()`;
    await Promise.allSettled(runs);
    await Promise.allSettled([
      first.end({ timeout: 5 }),
      second.end({ timeout: 5 }),
      monitor.end({ timeout: 5 }),
    ]);
  }
});
