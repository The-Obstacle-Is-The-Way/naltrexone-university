import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { previewOrApply } from '@/scripts/content-release/command-support';
import {
  activateRelease,
  bootstrapRelease,
  stageRelease,
} from '@/scripts/content-release/release-activation';
import { stageReleaseFromFiles } from '@/scripts/content-release/release-builder';
import {
  buildReleaseManifest,
  parseReleaseManifest,
  releaseManifestHash,
} from '@/scripts/content-release/release-manifest';
import {
  parseSeedQuestionFile,
  revisionFieldsFromSeed,
} from '@/scripts/seed/question-parser';
import { appendQuestionRevision } from '@/scripts/seed/question-revision-writer';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { createDisposableDatabase } from './disposable-database-test-helpers';
import { RELEASE_DECISION } from './release-decision-test-helpers';
import { source } from './seed-test-helpers';

let disposable: Awaited<ReturnType<typeof createDisposableDatabase>>;

beforeAll(async () => {
  disposable = await createDisposableDatabase();
}, 60_000);

afterAll(async () => {
  await disposable.drop();
});

beforeEach(async () => {
  await disposable.db
    .update(schema.contentReleasePointer)
    .set({ activeReleaseId: null, activatedAt: null });
  await disposable.db.delete(schema.contentReleaseActivations);
  await disposable.db.delete(schema.contentReleases);
  await disposable.db.delete(schema.questions);
});

async function currentQuestion() {
  const [question] = await disposable.db.select().from(schema.questions);
  if (!question) throw new Error('Expected the synthetic question');
  return question;
}

async function revisionRows() {
  return disposable.db
    .select()
    .from(schema.questionRevisions)
    .orderBy(schema.questionRevisions.revisionNumber);
}

async function itemRevision(releaseId: string) {
  const [item] = await disposable.db
    .select()
    .from(schema.contentReleaseItems)
    .where(eq(schema.contentReleaseItems.releaseId, releaseId));
  return item?.questionRevisionId;
}

async function stageLegacyRelease(
  revision: schema.QuestionRevision,
  slug: string,
  parentReleaseId: string | null,
  format: 'v2' | 'v3' = 'v2',
) {
  const manifest = parseReleaseManifest({
    format: `app-release-manifest-${format}`,
    items: [
      {
        slug,
        contentHash: revision.contentHash,
        ...(format === 'v3' ? { revisionId: revision.id } : {}),
      },
    ],
    removals: [],
  });
  const [release] = await disposable.db
    .insert(schema.contentReleases)
    .values({
      manifest,
      manifestHash: releaseManifestHash(manifest),
      parentReleaseId,
    })
    .returning();
  if (!release) throw new Error('Expected the legacy release');
  await disposable.db.insert(schema.contentReleaseItems).values({
    releaseId: release.id,
    questionId: revision.questionId,
    questionRevisionId: revision.id,
  });
  return release;
}

describe('release revision matching', () => {
  it('keeps the live revision after a key regression and repair', async () => {
    const slug = `it-match-${randomUUID()}`;
    const original = source(slug, { correctLabel: 'A' });
    const corrected = source(slug, { correctLabel: 'B' });
    for (const file of [original, corrected, original, corrected]) {
      await syncQuestionsFromFiles(disposable.db, [file]);
    }
    const current = await currentQuestion();
    const before = await revisionRows();
    expect(before).toHaveLength(4);
    const active = await bootstrapRelease(disposable.db, {
      record: RELEASE_DECISION,
    });

    const staged = await stageReleaseFromFiles(disposable.db, [corrected]);

    expect(staged).toMatchObject({ appended: 0, reused: 1 });
    expect(await itemRevision(staged.releaseId)).toBe(
      current.currentRevisionId,
    );
    const input = {
      releaseId: staged.releaseId,
      expectedActiveReleaseId: active.releaseId,
      record: RELEASE_DECISION,
    };
    const preview = await previewOrApply(disposable.db, false, (db) =>
      activateRelease(db, input),
    );
    expect(preview.plan).toMatchObject({ publish: [], update: [], revert: [] });
    await activateRelease(disposable.db, {
      ...input,
      expectedPlanId: preview.plan.id,
    });
    expect((await currentQuestion()).currentRevisionId).toBe(
      current.currentRevisionId,
    );
    expect(await revisionRows()).toEqual(before);
  });

  it.each(['v2', 'v3', 'v4'] as const)(
    'does not reuse a staged %s release that names an older identical revision',
    {
      meta: {
        ruleProof: {
          file: 'tests/integration/content-release-revision-matching.integration.test.ts',
          title:
            'does not reuse a staged %s release that names an older identical revision',
        },
      },
    },
    async (format) => {
      const slug = `it-match-${randomUUID()}`;
      const original = source(slug, { correctLabel: 'A' });
      const corrected = source(slug, { correctLabel: 'B' });
      for (const file of [original, corrected, original, corrected]) {
        await syncQuestionsFromFiles(disposable.db, [file]);
      }
      const current = await currentQuestion();
      const revisions = await revisionRows();
      const older = revisions[1];
      if (!older) throw new Error('Expected the earlier corrected revision');
      const active = await bootstrapRelease(disposable.db, {
        record: RELEASE_DECISION,
      });
      const priorStage =
        format !== 'v4'
          ? (await stageLegacyRelease(older, slug, active.releaseId, format)).id
          : await stageRelease(disposable.db, {
              items: [{ questionId: current.id, questionRevisionId: older.id }],
              parentReleaseId: active.releaseId,
            });

      const staged = await stageReleaseFromFiles(disposable.db, [corrected]);

      expect(await itemRevision(staged.releaseId)).toBe(
        current.currentRevisionId,
      );
      expect(staged.releaseId).not.toBe(priorStage);
      expect(await itemRevision(priorStage)).toBe(older.id);
      expect(
        await stageReleaseFromFiles(disposable.db, [corrected]),
      ).toMatchObject({
        releaseId: staged.releaseId,
        reusedRelease: true,
      });
    },
  );

  it.each(['v2', 'v3'] as const)(
    'activates and rolls back to a %s release without rewriting it',
    async (format) => {
      const slug = `it-match-${randomUUID()}`;
      await syncQuestionsFromFiles(disposable.db, [source(slug)]);
      const [revision] = await revisionRows();
      if (!revision) throw new Error('Expected the original revision');
      const legacy = await stageLegacyRelease(revision, slug, null, format);
      await activateRelease(disposable.db, {
        releaseId: legacy.id,
        expectedActiveReleaseId: null,
        record: RELEASE_DECISION,
      });
      const next = await stageReleaseFromFiles(disposable.db, [
        source(slug, { stem: 'An edited synthetic task.' }),
      ]);
      await activateRelease(disposable.db, {
        releaseId: next.releaseId,
        expectedActiveReleaseId: legacy.id,
        record: RELEASE_DECISION,
      });

      await activateRelease(disposable.db, {
        releaseId: legacy.id,
        expectedActiveReleaseId: next.releaseId,
        record: RELEASE_DECISION,
      });

      expect((await currentQuestion()).currentRevisionId).toBe(revision.id);
      expect(
        await disposable.db
          .select()
          .from(schema.contentReleases)
          .where(eq(schema.contentReleases.id, legacy.id)),
      ).toEqual([legacy]);
    },
  );

  it('rejects a manifest naming a different revision with identical content', async () => {
    const file = source(`it-match-${randomUUID()}`);
    await syncQuestionsFromFiles(disposable.db, [file]);
    const current = await currentQuestion();
    const [revision] = await revisionRows();
    if (!revision) throw new Error('Expected the original revision');
    const duplicate = await disposable.db.transaction((tx) =>
      appendQuestionRevision(
        tx,
        current.id,
        revisionFieldsFromSeed(parseSeedQuestionFile(file.raw)),
        { makeCurrent: false },
      ),
    );
    const manifest = buildReleaseManifest([
      {
        slug: current.slug,
        contentHash: revision.contentHash,
        revisionId: duplicate.revisionId,
      },
    ]);
    const [release] = await disposable.db
      .insert(schema.contentReleases)
      .values({
        manifest,
        manifestHash: releaseManifestHash(manifest),
      })
      .returning();
    if (!release) throw new Error('Expected the mismatched release');
    await disposable.db.insert(schema.contentReleaseItems).values({
      releaseId: release.id,
      questionId: current.id,
      questionRevisionId: revision.id,
    });

    await expect(
      activateRelease(disposable.db, {
        releaseId: release.id,
        expectedActiveReleaseId: null,
        record: RELEASE_DECISION,
      }),
    ).rejects.toMatchObject({ code: 'MANIFEST_ITEMS_MISMATCH' });
  });

  it('prefers the current match over a higher numbered identical revision', async () => {
    const file = source(`it-match-${randomUUID()}`);
    await syncQuestionsFromFiles(disposable.db, [file]);
    const current = await currentQuestion();
    await disposable.db.transaction(async (tx) => {
      await appendQuestionRevision(
        tx,
        current.id,
        revisionFieldsFromSeed(parseSeedQuestionFile(file.raw)),
        { makeCurrent: false },
      );
    });
    await bootstrapRelease(disposable.db, { record: RELEASE_DECISION });

    const staged = await stageReleaseFromFiles(disposable.db, [file]);

    expect(await itemRevision(staged.releaseId)).toBe(
      current.currentRevisionId,
    );
    expect(staged).toMatchObject({ appended: 0, reused: 1 });
  });

  it('chooses the highest matching revision when current content differs', async () => {
    const slug = `it-match-${randomUUID()}`;
    const original = source(slug, { correctLabel: 'A' });
    const corrected = source(slug, { correctLabel: 'B' });
    for (const file of [original, corrected, original, corrected]) {
      await syncQuestionsFromFiles(disposable.db, [file]);
    }
    const before = await revisionRows();
    await bootstrapRelease(disposable.db, { record: RELEASE_DECISION });

    const staged = await stageReleaseFromFiles(disposable.db, [original], {
      revert: [slug],
    });

    expect(await itemRevision(staged.releaseId)).toBe(before[2]?.id);
    expect(staged).toMatchObject({ appended: 0, reused: 1 });
    expect(await revisionRows()).toEqual(before);
  });

  it('reuses canonical-equivalent stored content without rewriting its rows or hash', async () => {
    const file = source(`it-match-${randomUUID()}`);
    await syncQuestionsFromFiles(disposable.db, [file]);
    const question = await currentQuestion();
    const fields = revisionFieldsFromSeed(parseSeedQuestionFile(file.raw));
    // Model legacy rows whose stored bytes precede seed canonicalization.
    const legacy = await disposable.db.transaction((tx) =>
      appendQuestionRevision(tx, question.id, {
        ...fields,
        stemMd: `\n${fields.stemMd}  \r\n`,
        choices: fields.choices.map((choice) => ({
          ...choice,
          textMd: `${choice.textMd}  \r\n`,
        })),
      }),
    );
    const before = await revisionRows();
    const choicesBefore = await disposable.db.select().from(schema.choices);
    await bootstrapRelease(disposable.db, { record: RELEASE_DECISION });

    const staged = await stageReleaseFromFiles(disposable.db, [file]);

    expect(await itemRevision(staged.releaseId)).toBe(legacy.revisionId);
    expect(staged).toMatchObject({ appended: 0, reused: 1 });
    expect(await revisionRows()).toEqual(before);
    expect(await disposable.db.select().from(schema.choices)).toEqual(
      choicesBefore,
    );
  });
});
