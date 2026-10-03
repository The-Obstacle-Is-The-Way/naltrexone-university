import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import {
  formatPlan,
  previewOrApply,
} from '@/scripts/content-release/command-support';
import {
  activateRelease,
  bootstrapRelease,
} from '@/scripts/content-release/release-activation';
import { stageReleaseFromFiles } from '@/scripts/content-release/release-builder';
import { changeHolds } from '@/scripts/content-release/release-holds';
import { runStageRelease } from '@/scripts/content-release/stage-release';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { createDisposableDatabase } from './disposable-database-test-helpers';
import { RELEASE_DECISION } from './release-decision-test-helpers';
import { source } from './seed-test-helpers';

// DEBT-492 gaps 2 and 3: a release that moves a question back to an earlier
// revision, which can undo an answer-key correction, or that publishes a held
// question at another revision, says so. Staging refuses an unnamed revert,
// and the plan names reverts, updates, first publications and replaced held
// revisions apart.
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

const CORRECTED = { correctText: 'The corrected answer.' };

// A live bank of two questions, then an activated correction of the first:
// its current revision is now the second, and the original is the first.
async function arrangeCorrected() {
  const [corrected, other] = [1, 2].map(() => `it-revert-${randomUUID()}`);
  if (!corrected || !other) throw new Error('slugs');
  await syncQuestionsFromFiles(disposable.db, [
    source(corrected),
    source(other),
  ]);
  const base = (
    await bootstrapRelease(disposable.db, { record: RELEASE_DECISION })
  ).releaseId;
  const correction = (
    await stageReleaseFromFiles(disposable.db, [
      source(corrected, CORRECTED),
      source(other),
    ])
  ).releaseId;
  await activateRelease(disposable.db, {
    releaseId: correction,
    expectedActiveReleaseId: base,
    record: RELEASE_DECISION,
  });
  return { corrected, other, base, correction };
}

async function planOf(releaseId: string, expectedActiveReleaseId: string) {
  return (
    await previewOrApply(disposable.db, false, (db) =>
      activateRelease(db, {
        releaseId,
        expectedActiveReleaseId,
        record: RELEASE_DECISION,
      }),
    )
  ).plan;
}

describe('DEBT-492: reverts and replaced held revisions are named', () => {
  it('refuses to stage a bundle that moves a question back to an earlier revision, naming it', async () => {
    const { corrected, other } = await arrangeCorrected();

    await expect(
      stageReleaseFromFiles(disposable.db, [source(corrected), source(other)]),
    ).rejects.toThrow(
      `The bundle moves ${corrected} back to an earlier revision, which can undo a correction. Restore the newer content, or name each with --revert.`,
    );
  });

  it('stages a named revert, and the plan lists it as a revert', async () => {
    const { corrected, other, correction } = await arrangeCorrected();

    const staged = await stageReleaseFromFiles(
      disposable.db,
      [source(corrected), source(other)],
      { revert: [corrected] },
    );

    expect(await planOf(staged.releaseId, correction)).toMatchObject({
      publish: [],
      update: [],
      revert: [corrected],
      replacesHeld: [],
    });
  });

  it.each([
    ['a question the bundle does not revert', 'other'],
    ['a question the bundle does not contain', 'absent'],
  ] as const)('refuses --revert for %s', async (_case, named) => {
    const { corrected, other } = await arrangeCorrected();
    const qid = named === 'other' ? other : 'it-revert-absent';

    await expect(
      stageReleaseFromFiles(
        disposable.db,
        [source(corrected, CORRECTED), source(other)],
        { revert: [qid] },
      ),
    ).rejects.toThrow(
      `Cannot revert ${qid}: the bundle does not move it to an earlier revision.`,
    );
  });

  it('lists a newer revision as an update and a new question as a publication', async () => {
    const { corrected, other, correction } = await arrangeCorrected();
    const added = `it-revert-${randomUUID()}`;

    const staged = await stageReleaseFromFiles(disposable.db, [
      source(corrected, CORRECTED),
      source(other, { stem: 'A clearer task.' }),
      source(added),
    ]);

    expect(await planOf(staged.releaseId, correction)).toMatchObject({
      publish: [added],
      update: [other],
      revert: [],
    });
  });

  it("names a rollback's reverts, and prints each kind on its own line", async () => {
    const { corrected, base, correction } = await arrangeCorrected();

    const plan = await planOf(base, correction);

    expect(plan).toMatchObject({
      publish: [],
      update: [],
      revert: [corrected],
    });
    expect(formatPlan(plan)).toEqual([
      `Plan: ${plan.id}`,
      'Archive (0)',
      'Publish (0)',
      'Update to a newer revision (0)',
      `Revert to an earlier revision (1): ${corrected}`,
      'Replaces a held revision (0)',
      'Withdraw for good (0)',
      'Left out, held (0)',
      'Left out, withdrawn (0)',
    ]);
  });

  it('passes each --revert of the stage command to staging', async () => {
    const { corrected, other } = await arrangeCorrected();
    const io = {
      env: { DATABASE_URL: disposable.url },
      log: () => {},
      readFiles: async () => [source(corrected), source(other)],
    };

    await expect(runStageRelease(['--apply'], io)).rejects.toThrow(
      'name each with --revert',
    );
    await expect(
      runStageRelease(['--apply', '--revert', corrected], io),
    ).resolves.toBeUndefined();
  });

  it('names an item that replaces a held revision', async () => {
    const { corrected, other, correction } = await arrangeCorrected();
    await changeHolds(disposable.db, {
      qids: [corrected],
      record: { reason: 'Dose under review', authority: 'Pharmacist' },
      lift: false,
    });

    const staged = await stageReleaseFromFiles(disposable.db, [
      source(corrected, { ...CORRECTED, stem: 'A reworded task.' }),
      source(other),
    ]);

    expect(await planOf(staged.releaseId, correction)).toMatchObject({
      publish: [corrected],
      replacesHeld: [corrected],
      excludedHeld: [],
    });
  });

  it('names a revert of a question that is not live as a revert', async () => {
    const { corrected, other, correction } = await arrangeCorrected();
    await changeHolds(disposable.db, {
      qids: [corrected],
      record: { reason: 'Dose under review', authority: 'Pharmacist' },
      lift: false,
    });

    const staged = await stageReleaseFromFiles(
      disposable.db,
      [source(corrected), source(other)],
      { revert: [corrected] },
    );

    expect(await planOf(staged.releaseId, correction)).toMatchObject({
      publish: [],
      revert: [corrected],
      replacesHeld: [corrected],
    });
  });

  it('does not count a lifted hold on another revision', async () => {
    const { corrected, other, correction } = await arrangeCorrected();
    const decision = { reason: 'Dose under review', authority: 'Pharmacist' };
    await changeHolds(disposable.db, {
      qids: [corrected],
      record: decision,
      lift: false,
    });
    await changeHolds(disposable.db, {
      qids: [corrected],
      record: decision,
      lift: true,
    });

    const staged = await stageReleaseFromFiles(disposable.db, [
      source(corrected, { ...CORRECTED, stem: 'A reworded task.' }),
      source(other),
    ]);

    expect(await planOf(staged.releaseId, correction)).toMatchObject({
      update: [corrected],
      replacesHeld: [],
    });
  });

  it('does not name the question again once the release that replaced its held revision is live', async () => {
    const { corrected, other, correction } = await arrangeCorrected();
    await changeHolds(disposable.db, {
      qids: [corrected],
      record: { reason: 'Dose under review', authority: 'Pharmacist' },
      lift: false,
    });
    const replacement = [
      source(corrected, { ...CORRECTED, stem: 'A reworded task.' }),
      source(other),
    ];
    const replacing = (await stageReleaseFromFiles(disposable.db, replacement))
      .releaseId;
    await activateRelease(disposable.db, {
      releaseId: replacing,
      expectedActiveReleaseId: correction,
      record: RELEASE_DECISION,
    });

    // The hold on the earlier revision stays unlifted, but this release
    // leaves the question where it is.
    const next = await stageReleaseFromFiles(disposable.db, [
      ...replacement.slice(0, 1),
      source(other, { stem: 'A clearer task.' }),
    ]);

    expect(await planOf(next.releaseId, replacing)).toMatchObject({
      update: [other],
      replacesHeld: [],
    });
  });
});
