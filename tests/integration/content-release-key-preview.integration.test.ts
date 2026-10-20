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
import {
  parseSeedQuestionFile,
  revisionFieldsFromSeed,
} from '@/scripts/seed/question-parser';
import { appendQuestionRevision } from '@/scripts/seed/question-revision-writer';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { createDisposableDatabase } from './disposable-database-test-helpers';
import { RELEASE_DECISION } from './release-decision-test-helpers';
import { type ContentEdits, source } from './seed-test-helpers';

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

describe('BUG-351: stage and activation previews name answer-key changes', () => {
  it.each([
    ['correct text', { correctText: 'Revised synthetic key.' }, true],
    ['correct label', { correctLabel: 'A' }, true],
    ['unrelated content', { stem: 'Revised synthetic task.' }, false],
  ] satisfies [string, ContentEdits, boolean][])(
    'compares %s in both previews',
    {
      meta: {
        ruleProof: {
          file: 'tests/integration/content-release-key-preview.integration.test.ts',
          title: 'compares %s in both previews',
        },
      },
    },
    async (_kind, edits, changed) => {
      const slug = `it-key-preview-${randomUUID()}`;
      await syncQuestionsFromFiles(disposable.db, [source(slug)]);
      const base = await bootstrapRelease(disposable.db, {
        record: RELEASE_DECISION,
      });

      const staged = await stageReleaseFromFiles(disposable.db, [
        source(slug, edits),
      ]);
      const preview = await previewOrApply(disposable.db, false, (db) =>
        activateRelease(db, {
          releaseId: staged.releaseId,
          expectedActiveReleaseId: base.releaseId,
          record: RELEASE_DECISION,
        }),
      );

      const answerKeyChange = changed ? [slug] : [];
      expect(staged.changes).toMatchObject({
        update: [slug],
        answerKeyChange,
      });
      expect(preview.plan.answerKeyChange).toEqual(answerKeyChange);
      expect(formatPlan(preview.plan)).toContain(
        changed ? `Answer-key changes (1): ${slug}` : 'Answer-key changes (0)',
      );
    },
  );

  it('prints each staging change by kind without publishing the preview', async () => {
    const [updated, drafted, withdrawn, added] = Array.from(
      { length: 4 },
      () => `it-key-preview-${randomUUID()}`,
    );
    if (!updated || !drafted || !withdrawn || !added) throw new Error('slugs');
    await syncQuestionsFromFiles(
      disposable.db,
      [updated, drafted, withdrawn].map((slug) => source(slug)),
    );
    await bootstrapRelease(disposable.db, { record: RELEASE_DECISION });
    const before = await disposable.db.select().from(schema.questions);
    const lines: string[] = [];

    await runStageRelease([], {
      env: { DATABASE_URL: disposable.url },
      log: (line) => lines.push(line),
      readFiles: async () => [
        source(updated, { correctText: 'Revised synthetic key.' }),
        source(drafted, { status: 'draft' }),
        source(withdrawn, { status: 'archived' }),
        source(added),
      ],
    });

    expect(lines).toContain(`Publish (1): ${added}`);
    expect(lines).toContain(`Update to a newer revision (1): ${updated}`);
    expect(lines).toContain(`Answer-key changes (1): ${updated}`);
    expect(lines).toContain(
      `Archive (2): ${[drafted, withdrawn].sort().join(', ')}`,
    );
    expect(lines).toContain(`Withdraw for good (1): ${withdrawn}`);
    expect(await disposable.db.select().from(schema.questions)).toEqual(before);
    expect(
      await disposable.db.select().from(schema.contentReleases),
    ).toHaveLength(1);
    expect(
      await disposable.db.select().from(schema.questionWithdrawals),
    ).toEqual([]);
  });

  it('canonicalizes stored correct text as the seed does before comparing keys', async () => {
    const slug = `it-key-preview-${randomUUID()}`;
    const file = source(slug);
    await syncQuestionsFromFiles(disposable.db, [file]);
    const [question] = await disposable.db.select().from(schema.questions);
    if (!question) throw new Error('question');
    const fields = revisionFieldsFromSeed(parseSeedQuestionFile(file.raw));
    await appendQuestionRevision(disposable.db, question.id, {
      ...fields,
      choices: fields.choices.map((choice) => ({
        ...choice,
        textMd: choice.isCorrect ? `\r\n${choice.textMd}\r\n` : choice.textMd,
      })),
    });
    const base = await bootstrapRelease(disposable.db, {
      record: RELEASE_DECISION,
    });

    const staged = await stageReleaseFromFiles(disposable.db, [
      source(slug, { stem: 'Revised synthetic task.' }),
    ]);
    const preview = await previewOrApply(disposable.db, false, (db) =>
      activateRelease(db, {
        releaseId: staged.releaseId,
        expectedActiveReleaseId: base.releaseId,
        record: RELEASE_DECISION,
      }),
    );

    expect(staged.changes.answerKeyChange).toEqual([]);
    expect(preview.plan.answerKeyChange).toEqual([]);
  });

  it('refuses an old preview when lifting a hold changes the compared key', async () => {
    const slug = `it-key-preview-${randomUUID()}`;
    await syncQuestionsFromFiles(disposable.db, [source(slug)]);
    const base = await bootstrapRelease(disposable.db, {
      record: RELEASE_DECISION,
    });
    const corrected = await stageReleaseFromFiles(disposable.db, [
      source(slug, { correctText: 'Revised synthetic key.' }),
    ]);
    await activateRelease(disposable.db, {
      releaseId: corrected.releaseId,
      expectedActiveReleaseId: base.releaseId,
      record: RELEASE_DECISION,
    });
    await changeHolds(disposable.db, {
      qids: [slug],
      lift: false,
      record: RELEASE_DECISION,
    });
    await activateRelease(disposable.db, {
      releaseId: base.releaseId,
      expectedActiveReleaseId: corrected.releaseId,
      record: RELEASE_DECISION,
      revert: [slug],
    });
    await activateRelease(disposable.db, {
      releaseId: corrected.releaseId,
      expectedActiveReleaseId: base.releaseId,
      record: RELEASE_DECISION,
    });
    const staged = await stageReleaseFromFiles(disposable.db, [
      source(slug, { stem: 'Revised synthetic task.' }),
    ]);
    const planned = await previewOrApply(disposable.db, false, (db) =>
      activateRelease(db, {
        releaseId: staged.releaseId,
        expectedActiveReleaseId: corrected.releaseId,
        record: RELEASE_DECISION,
      }),
    );

    await changeHolds(disposable.db, {
      qids: [slug],
      lift: true,
      record: RELEASE_DECISION,
      revert: [slug],
    });

    await expect(
      activateRelease(disposable.db, {
        releaseId: staged.releaseId,
        expectedActiveReleaseId: corrected.releaseId,
        expectedPlanId: planned.plan.id,
        record: RELEASE_DECISION,
      }),
    ).rejects.toMatchObject({ code: 'PLAN_MISMATCH' });
  });
});
