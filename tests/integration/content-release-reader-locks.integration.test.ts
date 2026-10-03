import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterEach, beforeEach, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import {
  activateRelease,
  bootstrapRelease,
} from '@/scripts/content-release/release-activation';
import { stageReleaseFromFiles } from '@/scripts/content-release/release-builder';
import { changeHolds } from '@/scripts/content-release/release-holds';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { createDisposableDatabase } from './disposable-database-test-helpers';
import { createCleanupState, createUser } from './helpers';
import { RELEASE_DECISION } from './release-decision-test-helpers';
import { source } from './seed-test-helpers';

let disposable: Awaited<ReturnType<typeof createDisposableDatabase>>;
beforeEach(async () => {
  disposable = await createDisposableDatabase();
});
afterEach(async () => {
  if (disposable) await disposable.drop();
});
async function arrange() {
  await syncQuestionsFromFiles(disposable.db, [
    source('audit-first'),
    source('audit-second'),
  ]);
  const user = await createUser(disposable.db, createCleanupState());
  const base = await bootstrapRelease(disposable.db, {
    record: RELEASE_DECISION,
  });
  return { user, base };
}
it('activates while a learner attempt transaction holds question foreign-key locks', async () => {
  const { user, base } = await arrange();
  const next = await stageReleaseFromFiles(disposable.db, [
    source('audit-first', { stem: 'Corrected task.' }),
    source('audit-second'),
  ]);
  const monitor = postgres(disposable.url, { max: 1, onnotice: () => {} });
  const writer = postgres(disposable.url, { max: 1, onnotice: () => {} });
  const activator = postgres(disposable.url, { max: 1, onnotice: () => {} });
  const release = createDeferred<void>();
  const ready = createDeferred<void>();
  const runs: Promise<unknown>[] = [];
  try {
    const questions = await monitor<
      { id: string; current_revision_id: string }[]
    >`SELECT id,current_revision_id FROM questions ORDER BY id`;
    const low = questions[0],
      high = questions[1];
    if (!low || !high) throw new Error('Missing questions');
    const write = writer
      .begin(async (tx) => {
        await tx`INSERT INTO attempts(user_id,question_id,question_revision_id,is_omitted,is_correct,time_spent_seconds) VALUES(${user.id},${high.id},${high.current_revision_id},true,false,0)`;
        ready.resolve();
        await release.promise;
        await tx`INSERT INTO attempts(user_id,question_id,question_revision_id,is_omitted,is_correct,time_spent_seconds) VALUES(${user.id},${low.id},${low.current_revision_id},true,false,0)`;
      })
      .then(
        () => 'written',
        (error: unknown) => {
          ready.reject(error);
          return error;
        },
      );
    runs.push(write);
    await ready.promise;
    const [activatorBackend] = await activator<
      { pid: number }[]
    >`SELECT pg_backend_pid() AS pid`;
    if (!activatorBackend) throw new Error('Missing backend');
    let activated = false;
    runs.push(
      activateRelease(drizzle(activator, { schema }), {
        releaseId: next.releaseId,
        expectedActiveReleaseId: base.releaseId,
        record: RELEASE_DECISION,
      }).then(
        () => {
          activated = true;
          return 'activated';
        },
        (error: unknown) => error,
      ),
    );
    // Let the attempt take its second foreign-key lock once activation has
    // finished, or is waiting on a lock. With an activation lock that
    // conflicts with KEY SHARE, the second case is the BUG-314 cycle, and this
    // fails on the real deadlock rather than on a timeout.
    await expect
      .poll(async () => {
        if (activated) return true;
        const [row] = await monitor<{ waiting: boolean }[]>`
          SELECT wait_event_type = 'Lock' AS waiting
          FROM pg_stat_activity WHERE pid = ${activatorBackend.pid}
        `;
        return row?.waiting === true;
      })
      .toBe(true);
    release.resolve();
    expect(await Promise.all(runs)).toEqual(['written', 'activated']);
  } finally {
    release.resolve();
    await Promise.allSettled(runs);
    await Promise.allSettled([
      monitor.end({ timeout: 5 }),
      writer.end({ timeout: 5 }),
      activator.end({ timeout: 5 }),
    ]);
  }
});

it('locks session questions in ascending order even with a reversed heap and requested order', async () => {
  const { user } = await arrange();
  const monitor = postgres(disposable.url, { max: 1, onnotice: () => {} });
  const blocker = postgres(disposable.url, { max: 1, onnotice: () => {} });
  const reader = postgres(disposable.url, { max: 1, onnotice: () => {} });
  const release = createDeferred<void>(),
    ready = createDeferred<void>();
  const runs: Promise<unknown>[] = [];
  try {
    await monitor.unsafe(
      'CREATE INDEX audit_question_desc ON questions(id DESC)',
    );
    await monitor.unsafe('CLUSTER questions USING audit_question_desc');
    const questions = await monitor<
      { id: string }[]
    >`SELECT id FROM questions ORDER BY id`;
    const low = questions[0],
      high = questions[1];
    if (!low || !high) throw new Error('Missing questions');
    // Exercise the supported sequential plan, with the worst physical ordering.
    await reader`SET enable_indexscan=off`;
    await reader`SET enable_bitmapscan=off`;
    const [backend] = await reader<
      { pid: number }[]
    >`SELECT pg_backend_pid() AS pid`;
    if (!backend) throw new Error('Missing backend');
    runs.push(
      blocker
        .begin(async (tx) => {
          await tx`SELECT id FROM questions WHERE id=${low.id} FOR NO KEY UPDATE`;
          ready.resolve();
          await release.promise;
        })
        .catch((error: unknown) => {
          ready.reject(error);
          return error;
        }),
    );
    await ready.promise;
    runs.push(
      new DrizzlePracticeSessionRepository(drizzle(reader, { schema }))
        .create({
          userId: user.id,
          mode: 'tutor',
          paramsJson: {
            count: 2,
            tagSlugs: [],
            difficulties: [],
            questionIds: [high.id, low.id],
          },
        })
        .catch((error: unknown) => error),
    );
    await expect
      .poll(async () => {
        const [row] =
          await monitor`SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=${backend.pid}`;
        return row?.waiting;
      })
      .toBe(true);
    await expect(
      monitor`SELECT id FROM questions WHERE id=${high.id} FOR NO KEY UPDATE NOWAIT`,
    ).resolves.toHaveLength(1);
    release.resolve();
    await Promise.all(runs);
  } finally {
    release.resolve();
    await Promise.allSettled(runs);
    await Promise.allSettled([
      monitor.end({ timeout: 5 }),
      blocker.end({ timeout: 5 }),
      reader.end({ timeout: 5 }),
    ]);
  }
});

it('completes a hold and a concurrent real session creation without deadlock', async () => {
  const { user } = await arrange();
  const monitor = postgres(disposable.url, { max: 1, onnotice: () => {} }),
    holder = postgres(disposable.url, { max: 1, onnotice: () => {} }),
    reader = postgres(disposable.url, { max: 1, onnotice: () => {} });
  const runs: Promise<unknown>[] = [];
  try {
    await monitor.unsafe('CLUSTER questions USING questions_pkey');
    const questions = await monitor<
      { id: string; slug: string }[]
    >`SELECT id,slug FROM questions ORDER BY id`;
    const high = questions[1];
    if (!high) throw new Error('Missing questions');
    await monitor.unsafe(
      'CREATE FUNCTION audit_hold_pause() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(489); RETURN NEW; END $$',
    );
    await monitor.unsafe(
      'CREATE TRIGGER audit_hold_pause BEFORE INSERT ON question_holds FOR EACH ROW EXECUTE FUNCTION audit_hold_pause()',
    );
    await monitor`SELECT pg_advisory_lock(489)`;
    const [backend] = await holder<
      { pid: number }[]
    >`SELECT pg_backend_pid() AS pid`;
    if (!backend) throw new Error('Missing backend');
    runs.push(
      changeHolds(drizzle(holder, { schema }), {
        qids: [high.slug],
        record: { reason: 'Audit', authority: 'Audit' },
        lift: false,
      }).then(
        () => 'held',
        (error: unknown) => error,
      ),
    );
    await expect
      .poll(async () => {
        const [row] =
          await monitor`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=${backend.pid} AND locktype='advisory' AND NOT granted) AS waiting`;
        return row?.waiting;
      })
      .toBe(true);
    let sessionCreated = false;
    runs.push(
      new DrizzlePracticeSessionRepository(drizzle(reader, { schema }))
        .create({
          userId: user.id,
          mode: 'tutor',
          paramsJson: {
            count: 2,
            tagSlugs: [],
            difficulties: [],
            questionIds: questions.map((q) => q.id),
          },
        })
        .then(
          () => {
            sessionCreated = true;
            return 'created';
          },
          (error: unknown) => error,
        ),
    );
    await expect
      .poll(async () => {
        const [row] =
          await monitor`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${backend.pid}=ANY(pg_blocking_pids(pid))) AS waiting`;
        return sessionCreated || row?.waiting;
      })
      .toBe(true);
    await monitor`SELECT pg_advisory_unlock(489)`;
    expect(await Promise.all(runs)).toEqual(['held', 'created']);
  } finally {
    await monitor`SELECT pg_advisory_unlock_all()`;
    await Promise.allSettled(runs);
    await Promise.allSettled([
      monitor.end({ timeout: 5 }),
      holder.end({ timeout: 5 }),
      reader.end({ timeout: 5 }),
    ]);
  }
});
