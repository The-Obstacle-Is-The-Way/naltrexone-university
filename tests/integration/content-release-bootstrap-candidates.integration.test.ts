import { randomUUID } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { runBootstrapRelease } from '@/scripts/content-release/bootstrap-release';
import { previewOrApply } from '@/scripts/content-release/command-support';
import {
  activateRelease,
  bootstrapRelease,
  lockReleasePointer,
} from '@/scripts/content-release/release-activation';
import { stageReleaseFromFiles } from '@/scripts/content-release/release-builder';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { createDisposableDatabase } from './disposable-database-test-helpers';
import { RELEASE_DECISION } from './release-decision-test-helpers';
import { source } from './seed-test-helpers';

let disposable: Awaited<ReturnType<typeof createDisposableDatabase>>;
beforeEach(async () => {
  disposable = await createDisposableDatabase();
});
afterEach(async () => {
  if (disposable) await disposable.drop();
});

async function revisionIds() {
  const rows = await disposable.db
    .select({ id: schema.questionRevisions.id })
    .from(schema.questionRevisions)
    .orderBy(asc(schema.questionRevisions.id));
  return rows.map(({ id }) => id);
}

async function storedRelease(releaseId: string) {
  const [release] = await disposable.db
    .select()
    .from(schema.contentReleases)
    .where(eq(schema.contentReleases.id, releaseId));
  if (!release) throw new Error('Missing test release');
  return release;
}

async function arrangeHistory() {
  const live = `it-candidates-live-${randomUUID()}`;
  const draft = `it-candidates-draft-${randomUUID()}`;
  await syncQuestionsFromFiles(disposable.db, [source(live)]);
  await syncQuestionsFromFiles(disposable.db, [
    source(live, { correctLabel: 'A' }),
    source(draft, { status: 'draft' }),
  ]);
  return { live, draft, candidates: await revisionIds() };
}

describe('bootstrap candidate history', () => {
  it('previews the candidate count without storing a release', async () => {
    const { candidates } = await arrangeHistory();
    const lines: string[] = [];
    await runBootstrapRelease(
      [
        '--reason',
        RELEASE_DECISION.reason,
        '--authority',
        RELEASE_DECISION.authority,
      ],
      {
        env: { DATABASE_URL: disposable.url },
        log: (line) => lines.push(line),
      },
    );
    expect(lines).toContain(
      `Pre-bootstrap candidate revisions: ${candidates.length}`,
    );
    expect(await disposable.db.select().from(schema.contentReleases)).toEqual(
      [],
    );
  });

  it('freezes all earlier revision candidates separately from the live release items', async () => {
    const { live, candidates } = await arrangeHistory();
    const [current] = await disposable.db
      .select({ id: schema.questions.currentRevisionId })
      .from(schema.questions)
      .where(eq(schema.questions.slug, live));
    const bootstrap = await bootstrapRelease(disposable.db, {
      record: RELEASE_DECISION,
    });

    expect((await storedRelease(bootstrap.releaseId)).manifest).toMatchObject({
      preBootstrapCandidates: candidates,
      items: [{ slug: live, revisionId: current?.id }],
    });
    const items = await disposable.db
      .select({ id: schema.contentReleaseItems.questionRevisionId })
      .from(schema.contentReleaseItems)
      .where(eq(schema.contentReleaseItems.releaseId, bootstrap.releaseId));
    expect(items).toEqual([{ id: current?.id }]);
    expect(bootstrap.items).toBe(1);
    await expect(
      disposable.db
        .update(schema.contentReleases)
        .set({ manifest: { preBootstrapCandidates: [] } })
        .where(eq(schema.contentReleases.id, bootstrap.releaseId)),
    ).rejects.toMatchObject({ cause: { code: '23001' } });
    expect((await storedRelease(bootstrap.releaseId)).manifest).toMatchObject({
      preBootstrapCandidates: candidates,
    });
  });

  it('refuses a bootstrap preview after only its historical candidate set changes', async () => {
    await arrangeHistory();
    const planned = await previewOrApply(disposable.db, false, (db) =>
      bootstrapRelease(db, { record: RELEASE_DECISION }),
    );
    await syncQuestionsFromFiles(disposable.db, [
      source(`it-later-draft-${randomUUID()}`, { status: 'draft' }),
    ]);

    await expect(
      bootstrapRelease(disposable.db, {
        record: RELEASE_DECISION,
        expectedPlanId: planned.plan.id,
      }),
    ).rejects.toMatchObject({ code: 'PLAN_MISMATCH' });
    expect(await disposable.db.select().from(schema.contentReleases)).toEqual(
      [],
    );
    expect(
      await disposable.db.select().from(schema.contentReleaseActivations),
    ).toEqual([]);
    expect(
      await disposable.db.select().from(schema.contentReleasePointer),
    ).toMatchObject([{ activeReleaseId: null }]);
  });

  it('applies the same preview when the candidate set and live content are unchanged', async () => {
    const { candidates } = await arrangeHistory();
    const planned = await previewOrApply(disposable.db, false, (db) =>
      bootstrapRelease(db, { record: RELEASE_DECISION }),
    );
    const applied = await bootstrapRelease(disposable.db, {
      record: RELEASE_DECISION,
      expectedPlanId: planned.plan.id,
    });
    expect(applied.plan.id).toBe(planned.plan.id);
    expect((await storedRelease(applied.releaseId)).manifest).toMatchObject({
      preBootstrapCandidates: candidates,
    });
  });

  it('does not add later draft-only or never-activated staged revisions to the frozen candidates', async () => {
    const { live, candidates } = await arrangeHistory();
    const bootstrap = await bootstrapRelease(disposable.db, {
      record: RELEASE_DECISION,
    });
    const frozen = await storedRelease(bootstrap.releaseId);
    // The direct seed already refuses an active-release database. The release
    // builder is the production path that can store new draft-only revisions.
    await expect(
      syncQuestionsFromFiles(disposable.db, [
        source(`it-refused-draft-${randomUUID()}`, { status: 'draft' }),
      ]),
    ).rejects.toMatchObject({ cause: { code: 'RELEASE_ACTIVE' } });
    const staged = await stageReleaseFromFiles(disposable.db, [
      source(live, { correctLabel: 'A', difficulty: 'hard' }),
      source(`it-staged-draft-${randomUUID()}`, { status: 'draft' }),
    ]);

    expect((await revisionIds()).length).toBe(candidates.length + 2);
    expect(await storedRelease(bootstrap.releaseId)).toEqual(frozen);
    expect(frozen.manifest).toMatchObject({
      preBootstrapCandidates: candidates,
    });
    expect((await storedRelease(staged.releaseId)).manifest).toMatchObject({
      preBootstrapCandidates: [],
    });
    expect(
      await disposable.db.select().from(schema.contentReleaseActivations),
    ).toHaveLength(1);
  });

  it('never publishes historical candidates when activating or rolling back the bootstrap', async () => {
    const { live, draft, candidates } = await arrangeHistory();
    const bootstrap = await bootstrapRelease(disposable.db, {
      record: RELEASE_DECISION,
    });
    const before = await disposable.db
      .select({
        slug: schema.questions.slug,
        status: schema.questions.status,
        revision: schema.questions.currentRevisionId,
      })
      .from(schema.questions)
      .orderBy(asc(schema.questions.slug));
    const staged = await stageReleaseFromFiles(disposable.db, [
      source(live, { correctLabel: 'A', difficulty: 'hard' }),
    ]);
    await activateRelease(disposable.db, {
      record: RELEASE_DECISION,
      releaseId: staged.releaseId,
      expectedActiveReleaseId: bootstrap.releaseId,
    });
    await activateRelease(disposable.db, {
      record: RELEASE_DECISION,
      releaseId: bootstrap.releaseId,
      expectedActiveReleaseId: staged.releaseId,
    });

    expect(
      await disposable.db
        .select({
          slug: schema.questions.slug,
          status: schema.questions.status,
          revision: schema.questions.currentRevisionId,
        })
        .from(schema.questions)
        .orderBy(asc(schema.questions.slug)),
    ).toEqual(before);
    expect(before.find((row) => row.slug === draft)?.status).toBe('draft');
    expect((await storedRelease(bootstrap.releaseId)).manifest).toMatchObject({
      preBootstrapCandidates: candidates,
    });
  });

  it('captures candidates after acquiring the release-pointer lock in the bootstrap transaction', async () => {
    await arrangeHistory();
    const writer = postgres(disposable.url, { max: 1 });
    const reader = postgres(disposable.url, { max: 1 });
    const seeded = createDeferred<void>();
    const finishSeed = createDeferred<void>();
    let writing: Promise<unknown> | undefined;
    let bootstrapping: ReturnType<typeof bootstrapRelease> | undefined;
    try {
      writing = drizzle(writer, { schema }).transaction(async (tx) => {
        await lockReleasePointer(tx);
        await syncQuestionsFromFiles(tx, [
          source(`it-in-flight-draft-${randomUUID()}`, { status: 'draft' }),
        ]);
        seeded.resolve();
        await finishSeed.promise;
      });
      await Promise.race([seeded.promise, writing]);
      const [backend] = await reader`SELECT pg_backend_pid() AS pid`;
      if (!backend) throw new Error('Missing reader backend');
      bootstrapping = bootstrapRelease(drizzle(reader, { schema }), {
        record: RELEASE_DECISION,
      });
      await expect
        .poll(async () => {
          const [row] = await disposable.db.execute<{ waiting: boolean }>(
            sql`SELECT cardinality(pg_blocking_pids(${backend.pid}::int)) > 0 AS waiting`,
          );
          return row?.waiting;
        })
        .toBe(true);
      finishSeed.resolve();
      await writing;
      const bootstrap = await bootstrapping;
      expect((await storedRelease(bootstrap.releaseId)).manifest).toMatchObject(
        { preBootstrapCandidates: await revisionIds() },
      );
    } finally {
      finishSeed.resolve();
      await Promise.allSettled([writing, bootstrapping]);
      await Promise.all([
        writer.end({ timeout: 5 }),
        reader.end({ timeout: 5 }),
      ]);
    }
  });
});
