import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { runActivateRelease } from '@/scripts/content-release/activate-release';
import {
  formatPlan,
  previewOrApply,
} from '@/scripts/content-release/command-support';
import { runHoldQuestions } from '@/scripts/content-release/hold-questions';
import {
  activateRelease,
  bootstrapRelease,
} from '@/scripts/content-release/release-activation';
import { stageReleaseFromFiles } from '@/scripts/content-release/release-builder';
import { changeHolds } from '@/scripts/content-release/release-holds';
import {
  buildReleaseManifest,
  releaseManifestHash,
} from '@/scripts/content-release/release-manifest';
import {
  parseSeedQuestionFile,
  revisionFieldsFromSeed,
} from '@/scripts/seed/question-parser';
import { appendQuestionRevision } from '@/scripts/seed/question-revision-writer';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import {
  createContentRepository,
  runFixtureStage,
} from '@/tests/shared/content-repository-test-helpers';
import { createDisposableDatabase } from './disposable-database-test-helpers';
import { RELEASE_DECISION } from './release-decision-test-helpers';
import { source } from './seed-test-helpers';

let disposable: Awaited<ReturnType<typeof createDisposableDatabase>>;
let repo: Awaited<ReturnType<typeof createContentRepository>>;
afterEach(async () => {
  await repo.dispose();
});
beforeEach(async () => {
  repo = await createContentRepository();
  disposable = await createDisposableDatabase();
});
afterEach(async () => {
  if (disposable) await disposable.drop();
});

const CORRECTION = { correctText: 'A revised synthetic key.' };
const DECISION_ARGS = [
  '--reason',
  RELEASE_DECISION.reason,
  '--authority',
  RELEASE_DECISION.authority,
];

async function arrangeCorrection(beforeBootstrap: boolean) {
  const slug = `it-key-return-${randomUUID()}`;
  await syncQuestionsFromFiles(disposable.db, [source(slug)]);
  if (beforeBootstrap)
    await syncQuestionsFromFiles(disposable.db, [source(slug, CORRECTION)]);
  const base = await bootstrapRelease(disposable.db, {
    record: RELEASE_DECISION,
  });
  if (beforeBootstrap)
    return { slug, base: base.releaseId, active: base.releaseId };
  const corrected = await stageReleaseFromFiles(disposable.db, [
    source(slug, CORRECTION),
  ]);
  await activateRelease(disposable.db, {
    releaseId: corrected.releaseId,
    expectedActiveReleaseId: base.releaseId,
    record: RELEASE_DECISION,
  });
  return { slug, base: base.releaseId, active: corrected.releaseId };
}

async function pointer() {
  const [row] = await disposable.db.select().from(schema.contentReleasePointer);
  return row?.activeReleaseId;
}

async function stageReturn(slug: string) {
  return stageReleaseFromFiles(
    disposable.db,
    [source(slug, { difficulty: 'hard' })],
    { revert: [slug] },
  );
}

describe('BUG-351: an earlier answer key returns only by a named decision', () => {
  it.each([
    ['pre-bootstrap candidates', true],
    ['activated releases', false],
  ] as const)(
    'refuses an edited stale key found in %s without leaving a stage behind',
    async (_kind, beforeBootstrap) => {
      const { slug } = await arrangeCorrection(beforeBootstrap);
      const before = await disposable.db
        .select()
        .from(schema.questionRevisions);
      const releases = await disposable.db
        .select()
        .from(schema.contentReleases);
      await expect(
        stageReleaseFromFiles(disposable.db, [
          source(slug, { difficulty: 'hard' }),
        ]),
      ).rejects.toThrow('earlier answer key');
      expect(
        await disposable.db.select().from(schema.questionRevisions),
      ).toEqual(before);
      expect(await disposable.db.select().from(schema.contentReleases)).toEqual(
        releases,
      );
    },
  );

  // Part 1's interim gap: the newest match (R3) outranks the repaired current
  // revision (R2), so the revision-number revert check alone accepts it.
  it('refuses an exact stale copy after a named repair, though it matches a newer revision', async () => {
    const slug = `it-key-return-${randomUUID()}`;
    await syncQuestionsFromFiles(disposable.db, [source(slug)]);
    await syncQuestionsFromFiles(disposable.db, [source(slug, CORRECTION)]);
    await syncQuestionsFromFiles(disposable.db, [source(slug)]);
    const base = await bootstrapRelease(disposable.db, {
      record: RELEASE_DECISION,
    });
    const repair = await stageReleaseFromFiles(
      disposable.db,
      [source(slug, CORRECTION)],
      { revert: [slug] },
    );
    await activateRelease(disposable.db, {
      releaseId: repair.releaseId,
      expectedActiveReleaseId: base.releaseId,
      record: RELEASE_DECISION,
      revert: [slug],
    });

    await expect(
      stageReleaseFromFiles(disposable.db, [source(slug)]),
    ).rejects.toThrow('earlier answer key');
  });

  it('names a stale-key return in both previews and records the named return and later repair decisions', async () => {
    const { slug, active } = await arrangeCorrection(true);
    const staged = await stageReturn(slug);
    expect(staged.changes.answerKeyReturn).toEqual([slug]);
    const planned = await previewOrApply(disposable.db, false, (db) =>
      activateRelease(db, {
        releaseId: staged.releaseId,
        expectedActiveReleaseId: active,
        record: RELEASE_DECISION,
        revert: [slug],
      }),
    );
    expect(formatPlan(planned.plan)).toContain(
      `Return to an earlier answer key (1): ${slug}`,
    );
    const returnDecision = {
      reason: 'Approve the earlier synthetic key',
      authority: 'Test reviewer',
    };
    await activateRelease(disposable.db, {
      releaseId: staged.releaseId,
      expectedActiveReleaseId: active,
      expectedPlanId: planned.plan.id,
      record: returnDecision,
      revert: [slug],
    });
    await expect(
      stageReleaseFromFiles(disposable.db, [
        source(slug, { ...CORRECTION, difficulty: 'hard' }),
      ]),
    ).rejects.toThrow('earlier answer key');
    const repair = await stageReleaseFromFiles(
      disposable.db,
      [source(slug, { ...CORRECTION, difficulty: 'hard' })],
      { revert: [slug] },
    );
    const repairDecision = {
      reason: 'Restore the reviewed correction',
      authority: 'Test owner',
    };
    await activateRelease(disposable.db, {
      releaseId: repair.releaseId,
      expectedActiveReleaseId: staged.releaseId,
      record: repairDecision,
      revert: [slug],
    });
    const receipts = await disposable.db
      .select()
      .from(schema.contentReleaseActivations);
    expect(receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          releaseId: staged.releaseId,
          ...returnDecision,
        }),
        expect.objectContaining({
          releaseId: repair.releaseId,
          ...repairDecision,
        }),
      ]),
    );
  });

  it('refuses activation without the actual return name and preserves the live pointer and receipt count', async () => {
    const { slug, active } = await arrangeCorrection(true);
    const staged = await stageReturn(slug);
    const receipts = await disposable.db
      .select()
      .from(schema.contentReleaseActivations);
    await expect(
      activateRelease(disposable.db, {
        releaseId: staged.releaseId,
        expectedActiveReleaseId: active,
        record: RELEASE_DECISION,
      }),
    ).rejects.toMatchObject({ code: 'KEY_RETURN_REQUIRED' });
    await expect(
      activateRelease(disposable.db, {
        releaseId: staged.releaseId,
        expectedActiveReleaseId: active,
        record: RELEASE_DECISION,
        revert: ['it-not-returning'],
      }),
    ).rejects.toMatchObject({ code: 'UNEXPECTED_REVERT' });
    expect(await pointer()).toBe(active);
    expect(
      await disposable.db.select().from(schema.contentReleaseActivations),
    ).toEqual(receipts);
  });

  it.each(['draft', 'published'] as const)(
    'does not treat a later %s-only stage as earlier publication',
    {
      meta: {
        ruleProof: {
          file: 'tests/integration/content-release-key-returns.integration.test.ts',
          title: 'does not treat a later %s-only stage as earlier publication',
        },
      },
    },
    async (status) => {
      const slug = `it-key-return-${randomUUID()}`;
      const anchor = `it-key-return-anchor-${randomUUID()}`;
      await syncQuestionsFromFiles(disposable.db, [
        source(slug),
        source(anchor),
      ]);
      const base = await bootstrapRelease(disposable.db, {
        record: RELEASE_DECISION,
      });
      await expect(
        syncQuestionsFromFiles(disposable.db, [
          source(slug, { ...CORRECTION, status: 'draft' }),
        ]),
      ).rejects.toMatchObject({ cause: { code: 'RELEASE_ACTIVE' } });
      await stageReleaseFromFiles(disposable.db, [
        source(slug, { ...CORRECTION, status }),
        source(anchor),
      ]);
      const selected = await stageReleaseFromFiles(disposable.db, [
        source(slug, { ...CORRECTION, difficulty: 'hard' }),
        source(anchor),
      ]);
      expect(selected.changes.answerKeyReturn).toEqual([]);
      const activated = await activateRelease(disposable.db, {
        releaseId: selected.releaseId,
        expectedActiveReleaseId: base.releaseId,
        record: RELEASE_DECISION,
      });
      expect(activated.plan.answerKeyReturn).toEqual([]);
    },
  );

  it.each(['app-release-manifest-v2', 'app-release-manifest-v3'] as const)(
    'does not invent missing pre-bootstrap history for %s',
    async (format) => {
      const slug = `it-key-return-${randomUUID()}`;
      await syncQuestionsFromFiles(disposable.db, [source(slug)]);
      await syncQuestionsFromFiles(disposable.db, [source(slug, CORRECTION)]);
      const [question] = await disposable.db.select().from(schema.questions);
      if (!question) throw new Error('Expected test question');
      const [revision] = await disposable.db
        .select()
        .from(schema.questionRevisions)
        .where(eq(schema.questionRevisions.id, question.currentRevisionId));
      if (!revision) throw new Error('Expected current revision');
      const manifest = buildReleaseManifest(
        [{ slug, contentHash: revision.contentHash, revisionId: revision.id }],
        [],
        format,
      );
      const [legacy] = await disposable.db
        .insert(schema.contentReleases)
        .values({ manifest, manifestHash: releaseManifestHash(manifest) })
        .returning();
      if (!legacy) throw new Error('Expected legacy release');
      await disposable.db.insert(schema.contentReleaseItems).values({
        releaseId: legacy.id,
        questionId: question.id,
        questionRevisionId: revision.id,
      });
      await activateRelease(disposable.db, {
        releaseId: legacy.id,
        expectedActiveReleaseId: null,
        record: RELEASE_DECISION,
      });
      const stage = await stageReleaseFromFiles(disposable.db, [
        source(slug, { difficulty: 'hard' }),
      ]);
      expect(stage.changes.answerKeyReturn).toEqual([]);
      const activated = await activateRelease(disposable.db, {
        releaseId: stage.releaseId,
        expectedActiveReleaseId: legacy.id,
        record: RELEASE_DECISION,
      });
      expect(activated.plan.answerKeyReturn).toEqual([]);
    },
  );

  it('requires a name for a key-changing rollback while leaving same-key edits unflagged', async () => {
    const { slug, base, active } = await arrangeCorrection(false);
    const sameKey = await stageReleaseFromFiles(disposable.db, [
      source(slug, { ...CORRECTION, difficulty: 'hard' }),
    ]);
    expect(sameKey.changes.answerKeyReturn).toEqual([]);
    await expect(
      activateRelease(disposable.db, {
        releaseId: base,
        expectedActiveReleaseId: active,
        record: RELEASE_DECISION,
      }),
    ).rejects.toMatchObject({ code: 'KEY_RETURN_REQUIRED' });
    const rollback = await activateRelease(disposable.db, {
      releaseId: base,
      expectedActiveReleaseId: active,
      record: RELEASE_DECISION,
      revert: [slug],
    });
    expect(rollback.plan.answerKeyReturn).toEqual([slug]);
  });

  it('invalidates a preview when intervening activations turn its new key into a return', async () => {
    const slug = `it-key-return-${randomUUID()}`;
    await syncQuestionsFromFiles(disposable.db, [source(slug)]);
    const base = await bootstrapRelease(disposable.db, {
      record: RELEASE_DECISION,
    });
    const stage = await stageReleaseFromFiles(disposable.db, [
      source(slug, CORRECTION),
    ]);
    const planned = await previewOrApply(disposable.db, false, (db) =>
      activateRelease(db, {
        releaseId: stage.releaseId,
        expectedActiveReleaseId: base.releaseId,
        record: RELEASE_DECISION,
      }),
    );
    await activateRelease(disposable.db, {
      releaseId: stage.releaseId,
      expectedActiveReleaseId: base.releaseId,
      record: RELEASE_DECISION,
    });
    await activateRelease(disposable.db, {
      releaseId: base.releaseId,
      expectedActiveReleaseId: stage.releaseId,
      record: RELEASE_DECISION,
      revert: [slug],
    });
    await expect(
      activateRelease(disposable.db, {
        releaseId: stage.releaseId,
        expectedActiveReleaseId: base.releaseId,
        expectedPlanId: planned.plan.id,
        record: RELEASE_DECISION,
        revert: [slug],
      }),
    ).rejects.toMatchObject({ code: 'PLAN_MISMATCH' });
    expect(await pointer()).toBe(base.releaseId);
  });

  it('passes named returns through the stage and activation commands and prints repeatable apply flags', async () => {
    const { slug } = await arrangeCorrection(true);
    const lines: string[] = [];
    const io = {
      env: { DATABASE_URL: disposable.url },
      log: (line: string) => lines.push(line),
    };
    await runFixtureStage(repo, ['--apply', '--revert', slug], {
      ...io,
      readFiles: async () => [source(slug, { difficulty: 'hard' })],
    });
    const previewCommand = lines.find((line) =>
      line.startsWith('Preview, then activate:'),
    );
    expect(previewCommand).toContain(`--revert ${slug}`);
    const releaseId = lines
      .join('\n')
      .match(/Release staging: release=([0-9a-f-]+)/)?.[1];
    if (!releaseId) throw new Error('Expected staged release');
    const stage = { releaseId };
    const active = await pointer();
    if (!active) throw new Error('Expected bootstrap');
    await runActivateRelease(
      [
        '--repo',
        repo.directory,
        '--release',
        stage.releaseId,
        '--expect-active',
        active,
        ...DECISION_ARGS,
        '--revert',
        slug,
      ],
      io,
    );
    const applyCommand = lines.find((line) =>
      line.startsWith('Apply exactly this plan:'),
    );
    expect(applyCommand).toContain(`--revert ${slug}`);
    const planned = await previewOrApply(disposable.db, false, (db) =>
      activateRelease(db, {
        releaseId: stage.releaseId,
        expectedActiveReleaseId: active,
        record: RELEASE_DECISION,
        revert: [slug],
      }),
    );
    await runActivateRelease(
      [
        '--repo',
        repo.directory,
        '--release',
        stage.releaseId,
        '--expect-active',
        active,
        ...DECISION_ARGS,
        '--revert',
        slug,
        '--plan',
        planned.plan.id,
        '--apply',
      ],
      io,
    );
    expect(await pointer()).toBe(stage.releaseId);
  });

  it('does not forward a same-key revision reversal as an activation key return', async () => {
    const slug = `it-key-return-${randomUUID()}`;
    await syncQuestionsFromFiles(disposable.db, [source(slug)]);
    const base = await bootstrapRelease(disposable.db, {
      record: RELEASE_DECISION,
    });
    const updated = await stageReleaseFromFiles(disposable.db, [
      source(slug, { difficulty: 'hard' }),
    ]);
    await activateRelease(disposable.db, {
      releaseId: updated.releaseId,
      expectedActiveReleaseId: base.releaseId,
      record: RELEASE_DECISION,
    });
    const lines: string[] = [];
    await runFixtureStage(repo, ['--apply', '--revert', slug], {
      env: { DATABASE_URL: disposable.url },
      log: (line) => lines.push(line),
      readFiles: async () => [source(slug)],
    });
    const command = lines.find((line) =>
      line.startsWith('Preview, then activate:'),
    );
    expect(command).toBeDefined();
    expect(command).not.toContain('--revert');
    const staged = await stageReleaseFromFiles(disposable.db, [source(slug)], {
      revert: [slug],
    });
    const activated = await activateRelease(disposable.db, {
      releaseId: staged.releaseId,
      expectedActiveReleaseId: updated.releaseId,
      record: RELEASE_DECISION,
    });
    expect(activated.plan.answerKeyReturn).toEqual([]);
  });

  it('canonicalizes a historical key without treating another question as its history', async () => {
    const slug = `it-key-return-${randomUUID()}`;
    const other = `it-key-return-other-${randomUUID()}`;
    await syncQuestionsFromFiles(disposable.db, [
      source(slug),
      source(other, CORRECTION),
    ]);
    const [question] = await disposable.db
      .select()
      .from(schema.questions)
      .where(eq(schema.questions.slug, slug));
    if (!question) throw new Error('Expected question');
    const fields = revisionFieldsFromSeed(
      parseSeedQuestionFile(
        source(slug, { correctText: 'Historical synthetic key.' }).raw,
      ),
    );
    await appendQuestionRevision(disposable.db, question.id, {
      ...fields,
      choices: fields.choices.map((choice) => ({
        ...choice,
        textMd: choice.isCorrect ? `\r\n${choice.textMd}  \r\n` : choice.textMd,
      })),
    });
    await syncQuestionsFromFiles(disposable.db, [source(slug)]);
    await bootstrapRelease(disposable.db, { record: RELEASE_DECISION });
    const unrelated = await stageReleaseFromFiles(disposable.db, [
      source(slug, CORRECTION),
      source(other, CORRECTION),
    ]);
    expect(unrelated.changes.answerKeyReturn).toEqual([]);
    await expect(
      stageReleaseFromFiles(disposable.db, [
        source(slug, {
          correctText: 'Historical synthetic key.',
          difficulty: 'hard',
        }),
        source(other, CORRECTION),
      ]),
    ).rejects.toThrow('earlier answer key');
  });

  it('refuses an unnamed key-returning hold lift atomically and accepts its explicitly named decision', async () => {
    const slug = `it-key-return-${randomUUID()}`;
    await syncQuestionsFromFiles(disposable.db, [source(slug)]);
    const base = await bootstrapRelease(disposable.db, {
      record: RELEASE_DECISION,
    });
    await changeHolds(disposable.db, {
      qids: [slug],
      lift: false,
      record: RELEASE_DECISION,
    });
    const corrected = await stageReleaseFromFiles(disposable.db, [
      source(slug, CORRECTION),
    ]);
    await activateRelease(disposable.db, {
      releaseId: corrected.releaseId,
      expectedActiveReleaseId: base.releaseId,
      record: RELEASE_DECISION,
    });
    await activateRelease(disposable.db, {
      releaseId: base.releaseId,
      expectedActiveReleaseId: corrected.releaseId,
      record: RELEASE_DECISION,
    });
    const [before] = await disposable.db
      .select()
      .from(schema.questions)
      .where(eq(schema.questions.slug, slug));
    await expect(
      changeHolds(disposable.db, {
        qids: [slug],
        lift: true,
        record: RELEASE_DECISION,
      }),
    ).rejects.toMatchObject({ code: 'KEY_RETURN_REQUIRED' });
    expect(
      await disposable.db.select().from(schema.questionHolds),
    ).toMatchObject([{ liftedAt: null }]);
    expect(await disposable.db.select().from(schema.questions)).toEqual([
      before,
    ]);
    const lines: string[] = [];
    await runHoldQuestions(
      ['--qid', slug, '--lift', '--revert', slug, ...DECISION_ARGS, '--apply'],
      {
        env: { DATABASE_URL: disposable.url },
        log: (line) => lines.push(line),
      },
    );
    expect(
      await disposable.db.select().from(schema.questionHolds),
    ).toMatchObject([{ liftedAt: expect.any(Date) }]);
    expect(lines).toContain(`Return to an earlier answer key (1): ${slug}`);
    const receipts = await disposable.db
      .select()
      .from(schema.contentReleaseActivations);
    expect(receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          releaseId: base.releaseId,
          reason: `hold lifted: ${RELEASE_DECISION.reason}`,
          authority: RELEASE_DECISION.authority,
        }),
      ]),
    );
  });
});
