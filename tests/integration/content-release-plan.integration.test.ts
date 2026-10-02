import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { previewOrApply } from '@/scripts/content-release/command-support';
import { runHoldQuestions } from '@/scripts/content-release/hold-questions';
import {
  activateRelease,
  bootstrapRelease,
} from '@/scripts/content-release/release-activation';
import { stageReleaseFromFiles } from '@/scripts/content-release/release-builder';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { runContentWithdrawal } from '@/scripts/seed/withdraw-questions';
import { createDisposableDatabase } from './disposable-database-test-helpers';
import { source } from './seed-test-helpers';

// DEBT-489: an activation applies exactly the plan its preview showed. The
// plan binds the release, the release it replaces, every (question, revision)
// it publishes, every question it archives and every question it withdraws,
// and is recomputed under the activation's own locks.
let disposable: Awaited<ReturnType<typeof createDisposableDatabase>>;

beforeAll(async () => {
  disposable = await createDisposableDatabase();
}, 60_000);

afterAll(async () => {
  await disposable.drop();
});

beforeEach(async () => {
  const { db } = disposable;
  await db
    .update(schema.contentReleasePointer)
    .set({ activeReleaseId: null, activatedAt: null });
  await db.delete(schema.contentReleaseActivations);
  await db.delete(schema.contentReleases);
  await db.delete(schema.questions);
});

async function arrange() {
  const [kept, dropped, retired] = [1, 2, 3].map(
    () => `it-plan-${randomUUID()}`,
  );
  if (!kept || !dropped || !retired) throw new Error('slugs');
  await syncQuestionsFromFiles(
    disposable.db,
    [kept, dropped, retired].map((qid) => source(qid)),
  );
  const base = (await bootstrapRelease(disposable.db)).releaseId;
  const next = await stageReleaseFromFiles(disposable.db, [
    source(kept, { stem: 'A corrected task.' }),
    source(dropped, { status: 'draft' }),
    source(retired, { status: 'archived' }),
  ]);
  return { kept, dropped, retired, base, next: next.releaseId };
}

async function preview(releaseId: string, expectedActiveReleaseId: string) {
  return previewOrApply(disposable.db, false, (db) =>
    activateRelease(db, { releaseId, expectedActiveReleaseId }),
  );
}

async function statusOf(slug: string) {
  const [row] = await disposable.db
    .select({ status: schema.questions.status })
    .from(schema.questions)
    .where(eq(schema.questions.slug, slug));
  return row?.status;
}

describe('DEBT-489: an activation applies the plan its preview showed', () => {
  it('names every change in the plan, and applies it given the same plan id', async () => {
    const { kept, dropped, retired, base, next } = await arrange();

    const planned = await preview(next, base);

    expect(planned.plan).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f]{64}$/),
      archive: [dropped, retired].sort(),
      changed: [kept],
      withdraw: [retired],
    });
    await expect(
      activateRelease(disposable.db, {
        releaseId: next,
        expectedActiveReleaseId: base,
        expectedPlanId: planned.plan.id,
      }),
    ).resolves.toMatchObject({ plan: { id: planned.plan.id } });
    expect(await statusOf(dropped)).toBe('archived');
  });

  it('refuses a plan id that no longer matches, changing nothing', async () => {
    const { kept, base, next } = await arrange();
    const planned = await preview(next, base);
    // Between the preview and the apply, a question the release publishes is
    // withdrawn, so the release would now publish less than was reviewed.
    await runContentWithdrawal(
      [
        '--qid',
        kept,
        '--reason',
        'Unsafe dosing guidance',
        '--authority',
        'Clinical lead',
        '--apply',
      ],
      { env: { DATABASE_URL: disposable.url }, log: () => {} },
    );

    await expect(
      activateRelease(disposable.db, {
        releaseId: next,
        expectedActiveReleaseId: base,
        expectedPlanId: planned.plan.id,
      }),
    ).rejects.toMatchObject({ code: 'PLAN_MISMATCH' });

    const [pointer] = await disposable.db
      .select({ id: schema.contentReleasePointer.activeReleaseId })
      .from(schema.contentReleasePointer);
    expect(pointer?.id).toBe(base);
  });

  it('names the items a hold or a withdrawal leaves out', async () => {
    const { kept, dropped, base } = await arrange();
    const io = { env: { DATABASE_URL: disposable.url }, log: () => {} };
    const record = ['--reason', 'Under review', '--authority', 'Clinical lead'];
    await runHoldQuestions(['--qid', kept, ...record, '--apply'], io);
    await runContentWithdrawal(['--qid', dropped, ...record, '--apply'], io);

    const planned = await preview(base, base);

    expect(planned.plan).toMatchObject({
      excludedHeld: [kept],
      excludedWithdrawn: [dropped],
    });
  });

  it('binds the plan to its release, even against one with the same effect', async () => {
    const { kept, dropped, retired, base } = await arrange();
    const asDraft = await stageReleaseFromFiles(disposable.db, [
      source(kept),
      source(retired),
      source(dropped, { status: 'draft' }),
    ]);
    const asNamed = await stageReleaseFromFiles(
      disposable.db,
      [source(kept), source(retired)],
      { remove: [dropped] },
    );
    const planned = await preview(asDraft.releaseId, base);

    await expect(
      activateRelease(disposable.db, {
        releaseId: asNamed.releaseId,
        expectedActiveReleaseId: base,
        expectedPlanId: planned.plan.id,
      }),
    ).rejects.toMatchObject({ code: 'PLAN_MISMATCH' });
  });

  it('binds a bootstrap to the live questions its preview adopted', async () => {
    const live = `it-plan-${randomUUID()}`;
    await syncQuestionsFromFiles(disposable.db, [source(live)]);
    const bootstrapPreview = () =>
      previewOrApply(disposable.db, false, (db) => bootstrapRelease(db));
    const planned = await bootstrapPreview();
    expect((await bootstrapPreview()).plan.id).toBe(planned.plan.id);
    // Between the preview and the apply, the seed publishes another question.
    await syncQuestionsFromFiles(disposable.db, [
      source(live),
      source(`it-plan-${randomUUID()}`),
    ]);

    await expect(
      bootstrapRelease(disposable.db, { expectedPlanId: planned.plan.id }),
    ).rejects.toMatchObject({ code: 'PLAN_MISMATCH' });

    const [pointer] = await disposable.db
      .select({ id: schema.contentReleasePointer.activeReleaseId })
      .from(schema.contentReleasePointer);
    expect(pointer?.id).toBeNull();
    const fresh = await bootstrapPreview();
    await expect(
      bootstrapRelease(disposable.db, { expectedPlanId: fresh.plan.id }),
    ).resolves.toMatchObject({ items: 2, plan: { id: fresh.plan.id } });
  });

  it('gives a rollback its own plan, which must match too', async () => {
    const { dropped, base, next } = await arrange();
    const forward = await preview(next, base);
    await activateRelease(disposable.db, {
      releaseId: next,
      expectedActiveReleaseId: base,
      expectedPlanId: forward.plan.id,
    });

    const back = await preview(base, next);

    expect(back.plan.id).not.toBe(forward.plan.id);
    await expect(
      activateRelease(disposable.db, {
        releaseId: base,
        expectedActiveReleaseId: next,
        expectedPlanId: forward.plan.id,
      }),
    ).rejects.toMatchObject({ code: 'PLAN_MISMATCH' });
    await activateRelease(disposable.db, {
      releaseId: base,
      expectedActiveReleaseId: next,
      expectedPlanId: back.plan.id,
    });
    expect(await statusOf(dropped)).toBe('published');
  });
});
