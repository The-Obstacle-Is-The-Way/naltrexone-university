import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import {
  activateRelease,
  bootstrapRelease,
  stageRelease,
} from '@/scripts/content-release/release-activation';
import { stageReleaseFromFiles } from '@/scripts/content-release/release-builder';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { runContentWithdrawal } from '@/scripts/seed/withdraw-questions';
import { createDisposableDatabase } from './disposable-database-test-helpers';
import { RELEASE_DECISION } from './release-decision-test-helpers';
import { source } from './seed-test-helpers';

// DEBT-489: a release accounts for every live question. One it leaves out is
// a named removal, never a missing file; and an `archived` removal becomes a
// permanent withdrawal only when its release activates.
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

async function seedLive(count: number) {
  const slugs = Array.from(
    { length: count },
    () => `it-removal-${randomUUID()}`,
  );
  await syncQuestionsFromFiles(
    disposable.db,
    slugs.map((qid) => source(qid)),
  );
  const rows = await disposable.db
    .select({
      slug: schema.questions.slug,
      questionId: schema.questions.id,
      questionRevisionId: schema.questions.currentRevisionId,
    })
    .from(schema.questions)
    .where(inArray(schema.questions.slug, slugs));
  return slugs.map((qid) => {
    const row = rows.find((candidate) => candidate.slug === qid);
    if (!row) throw new Error(`Seed did not write ${qid}`);
    return row;
  });
}

function item(question: { questionId: string; questionRevisionId: string }) {
  return {
    questionId: question.questionId,
    questionRevisionId: question.questionRevisionId,
  };
}

async function statusOf(slug: string) {
  const [row] = await disposable.db
    .select({ status: schema.questions.status })
    .from(schema.questions)
    .where(eq(schema.questions.slug, slug));
  return row?.status;
}

async function withdrawalsOf(questionId: string) {
  return disposable.db
    .select({
      reason: schema.questionWithdrawals.reason,
      authority: schema.questionWithdrawals.authority,
    })
    .from(schema.questionWithdrawals)
    .where(eq(schema.questionWithdrawals.questionId, questionId));
}

async function activeRelease() {
  const [pointer] = await disposable.db
    .select({ id: schema.contentReleasePointer.activeReleaseId })
    .from(schema.contentReleasePointer);
  return pointer?.id ?? null;
}

describe('DEBT-489: a release accounts for every live question', () => {
  it('refuses a new release that leaves a live question unaccounted for, changing nothing', async () => {
    const [kept, missing] = await seedLive(2);
    if (!kept || !missing) throw new Error('seed');
    const base = (
      await bootstrapRelease(disposable.db, {
        record: RELEASE_DECISION,
      })
    ).releaseId;
    const next = await stageRelease(disposable.db, {
      items: [item(kept)],
      parentReleaseId: base,
    });

    await expect(
      activateRelease(disposable.db, {
        record: RELEASE_DECISION,
        releaseId: next,
        expectedActiveReleaseId: base,
      }),
    ).rejects.toMatchObject({
      code: 'INCOMPLETE_RELEASE',
      message: expect.stringContaining(missing.slug),
    });

    expect(await statusOf(missing.slug)).toBe('published');
    expect(await activeRelease()).toBe(base);
  });

  it('accepts a named removal, and a withdrawn question left out', async () => {
    const [kept, drafted, withdrawn] = await seedLive(3);
    if (!kept || !drafted || !withdrawn) throw new Error('seed');
    const base = (
      await bootstrapRelease(disposable.db, {
        record: RELEASE_DECISION,
      })
    ).releaseId;
    await runContentWithdrawal(
      [
        '--qid',
        withdrawn.slug,
        '--reason',
        'Unsafe dosing guidance',
        '--authority',
        'Clinical lead',
        '--apply',
      ],
      { env: { DATABASE_URL: disposable.url }, log: () => {} },
    );
    const next = await stageRelease(disposable.db, {
      items: [item(kept)],
      removals: [{ questionId: drafted.questionId, kind: 'draft' }],
      parentReleaseId: base,
    });

    await activateRelease(disposable.db, {
      record: RELEASE_DECISION,
      releaseId: next,
      expectedActiveReleaseId: base,
    });

    expect(await statusOf(kept.slug)).toBe('published');
    expect(await statusOf(drafted.slug)).toBe('archived');
    expect(await statusOf(withdrawn.slug)).toBe('archived');
    // A draft removal is temporary: nothing is withdrawn.
    expect(await withdrawalsOf(drafted.questionId)).toEqual([]);
  });

  it('withdraws an archived removal when its release activates, and not before', async () => {
    const [kept, retired] = await seedLive(2);
    if (!kept || !retired) throw new Error('seed');
    const base = (
      await bootstrapRelease(disposable.db, {
        record: RELEASE_DECISION,
      })
    ).releaseId;
    const next = await stageRelease(disposable.db, {
      items: [item(kept)],
      removals: [{ questionId: retired.questionId, kind: 'archived' }],
      parentReleaseId: base,
    });

    // Staged but not activated: nothing is withdrawn, so re-applying the
    // active release keeps the question live.
    expect(await withdrawalsOf(retired.questionId)).toEqual([]);
    await activateRelease(disposable.db, {
      record: RELEASE_DECISION,
      releaseId: base,
      expectedActiveReleaseId: base,
    });
    expect(await statusOf(retired.slug)).toBe('published');

    const summary = await activateRelease(disposable.db, {
      record: RELEASE_DECISION,
      releaseId: next,
      expectedActiveReleaseId: base,
    });

    expect(summary).toMatchObject({ withdrawn: 1, archived: 1 });
    expect(await statusOf(retired.slug)).toBe('archived');
    // The withdrawal names the release that made it.
    expect(await withdrawalsOf(retired.questionId)).toEqual([
      {
        reason: `archived in content release ${next}: ${RELEASE_DECISION.reason}`,
        authority: RELEASE_DECISION.authority,
      },
    ]);
  });

  it('refuses to stage a removal that names no question', async () => {
    await expect(
      stageRelease(disposable.db, {
        items: [],
        removals: [{ questionId: randomUUID(), kind: 'draft' }],
        parentReleaseId: null,
      }),
    ).rejects.toThrow(/is not a question/);
  });

  it('lets a rollback restore an earlier snapshot without naming newer members', async () => {
    const [kept] = await seedLive(1);
    if (!kept) throw new Error('seed');
    const base = (
      await bootstrapRelease(disposable.db, {
        record: RELEASE_DECISION,
      })
    ).releaseId;
    // A question first added by a release: the bootstrap never named it.
    const added = `it-removal-${randomUUID()}`;
    const next = await stageReleaseFromFiles(disposable.db, [
      source(kept.slug),
      source(added),
    ]);
    await activateRelease(disposable.db, {
      record: RELEASE_DECISION,
      releaseId: next.releaseId,
      expectedActiveReleaseId: base,
    });
    expect(await statusOf(added)).toBe('published');

    await activateRelease(disposable.db, {
      record: RELEASE_DECISION,
      releaseId: base,
      expectedActiveReleaseId: next.releaseId,
    });

    expect(await statusOf(added)).toBe('archived');
    expect(await activeRelease()).toBe(base);
  });
});
