import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { runHoldQuestions } from '@/scripts/content-release/hold-questions';
import {
  activateRelease,
  bootstrapRelease,
} from '@/scripts/content-release/release-activation';
import { stageReleaseFromFiles } from '@/scripts/content-release/release-builder';
import { runStageRelease } from '@/scripts/content-release/stage-release';
import type { SeedSourceFile } from '@/scripts/seed/file-reader';
import { runContentWithdrawal } from '@/scripts/seed/withdraw-questions';
import { createDisposableDatabase } from './disposable-database-test-helpers';
import { createCleanupState, createQuestion } from './helpers';
import { source } from './seed-test-helpers';

// Staging commits drafts and revisions, and these cases activate what they
// stage, so they run against a database of their own.
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

async function arrangeLive(slug = `it-builder-${randomUUID()}`) {
  // Seeded the way the direct seed writes it, so the files below compare
  // against the same content.
  const question = await createQuestion(disposable.db, createCleanupState(), {
    slug,
    status: 'published',
    difficulty: 'easy',
  });
  return question;
}

async function questionBySlug(slug: string) {
  const [row] = await disposable.db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.slug, slug));
  return row;
}

async function revisionsOf(questionId: string) {
  return disposable.db
    .select({ id: schema.questionRevisions.id })
    .from(schema.questionRevisions)
    .where(eq(schema.questionRevisions.questionId, questionId));
}

async function bootstrap() {
  return (await bootstrapRelease(disposable.db)).releaseId;
}

describe('DEBT-483: staging a release from MDX', () => {
  it('refuses while no release is active', async () => {
    await expect(
      stageReleaseFromFiles(disposable.db, [
        source(`it-builder-${randomUUID()}`),
      ]),
    ).rejects.toThrow(/No release is active/);
  });

  it('stages new and changed content invisibly, and activation then publishes it', async () => {
    const changed = await arrangeLive();
    const dropped = await arrangeLive();
    const active = await bootstrap();
    const added = `it-builder-${randomUUID()}`;

    const staged = await stageReleaseFromFiles(disposable.db, [
      source(changed.slug, { stem: 'A corrected clinical task.' }),
      source(dropped.slug, { status: 'draft' }),
      source(added),
    ]);

    expect(staged).toMatchObject({
      parentReleaseId: active,
      inserted: 1,
      appended: 2,
      items: 2,
      removals: 1,
      withdrawals: 0,
      reusedRelease: false,
    });
    // Nothing a learner reads has changed yet.
    expect(await questionBySlug(changed.slug)).toMatchObject({
      status: 'published',
      currentRevisionId: changed.revisionId,
    });
    expect((await questionBySlug(added))?.status).toBe('draft');
    expect((await questionBySlug(dropped.slug))?.status).toBe('published');

    await activateRelease(disposable.db, {
      releaseId: staged.releaseId,
      expectedActiveReleaseId: active,
    });

    const after = await questionBySlug(changed.slug);
    expect(after?.status).toBe('published');
    expect(after?.currentRevisionId).not.toBe(changed.revisionId);
    expect((await questionBySlug(added))?.status).toBe('published');
    expect((await questionBySlug(dropped.slug))?.status).toBe('archived');
  });

  it('reuses a revision with the same content, and the same release on a restage', async () => {
    const question = await arrangeLive();
    await bootstrap();
    const files = [
      source(question.slug, { stem: 'A corrected clinical task.' }),
    ];
    const first = await stageReleaseFromFiles(disposable.db, files);

    const second = await stageReleaseFromFiles(disposable.db, files);

    expect(second).toMatchObject({
      releaseId: first.releaseId,
      reusedRelease: true,
      appended: 0,
      reused: 1,
    });
    expect(await revisionsOf(question.id)).toHaveLength(2);
  });

  // DEBT-489: staging has no lasting side effect. An archived file is a
  // removal that withdraws the question only when its release activates.
  it('withdraws an archived file when its release activates, not when it is staged', async () => {
    const question = await arrangeLive();
    const kept = await arrangeLive();
    const active = await bootstrap();
    const withdrawalsOfQuestion = () =>
      disposable.db
        .select({ authority: schema.questionWithdrawals.authority })
        .from(schema.questionWithdrawals)
        .where(eq(schema.questionWithdrawals.questionId, question.id));

    const staged = await stageReleaseFromFiles(disposable.db, [
      source(question.slug, { status: 'archived' }),
      source(kept.slug),
    ]);

    expect(staged).toMatchObject({ items: 1, removals: 1, withdrawals: 1 });
    expect(await withdrawalsOfQuestion()).toEqual([]);
    // Abandoning the staged release leaves the question live.
    await activateRelease(disposable.db, {
      releaseId: active,
      expectedActiveReleaseId: active,
    });
    expect((await questionBySlug(question.slug))?.status).toBe('published');
    await activateRelease(disposable.db, {
      releaseId: staged.releaseId,
      expectedActiveReleaseId: active,
    });
    expect((await questionBySlug(question.slug))?.status).toBe('archived');
    expect(await withdrawalsOfQuestion()).toEqual(
      expect.arrayContaining([{ authority: 'content release' }]),
    );
  });

  it('refuses to stage a withdrawn question as published, writing nothing at all', async () => {
    const question = await arrangeLive();
    const kept = await arrangeLive();
    const active = await bootstrap();
    const retiring = await stageReleaseFromFiles(disposable.db, [
      source(question.slug, { status: 'archived' }),
      source(kept.slug),
    ]);
    await activateRelease(disposable.db, {
      releaseId: retiring.releaseId,
      expectedActiveReleaseId: active,
    });
    const revisions = await revisionsOf(question.id);
    const releases = await disposable.db.select().from(schema.contentReleases);
    const added = `it-builder-${randomUUID()}`;

    // The whole stage is one transaction: the new question goes too.
    await expect(
      stageReleaseFromFiles(disposable.db, [
        source(added),
        source(kept.slug),
        source(question.slug, { stem: 'A corrected clinical task.' }),
      ]),
    ).rejects.toThrow(/Refusing to stage withdrawn question/);

    expect(await revisionsOf(question.id)).toEqual(revisions);
    expect(await questionBySlug(added)).toBeUndefined();
    expect(await disposable.db.select().from(schema.contentReleases)).toEqual(
      releases,
    );
  });

  // DEBT-489: absence from the bundle is never a removal.
  it('refuses a bundle that leaves out live questions, naming them and writing nothing', async () => {
    const live = await Promise.all([1, 2, 3, 4, 5].map(() => arrangeLive()));
    await bootstrap();
    const releases = await disposable.db.select().from(schema.contentReleases);
    const missing = live
      .slice(2)
      .map((question) => question.slug)
      .sort();

    await expect(
      stageReleaseFromFiles(
        disposable.db,
        live.slice(0, 2).map((question) => source(question.slug)),
      ),
    ).rejects.toThrow(
      `The bundle leaves out live questions: ${missing.join(', ')}`,
    );

    expect(await disposable.db.select().from(schema.contentReleases)).toEqual(
      releases,
    );
  });

  it('stages a removal the operator names', async () => {
    const kept = await arrangeLive();
    const removed = await arrangeLive();
    const active = await bootstrap();

    const staged = await stageReleaseFromFiles(
      disposable.db,
      [source(kept.slug)],
      { remove: [removed.slug] },
    );
    await activateRelease(disposable.db, {
      releaseId: staged.releaseId,
      expectedActiveReleaseId: active,
    });

    expect(staged).toMatchObject({ items: 1, removals: 1, withdrawals: 0 });
    expect((await questionBySlug(removed.slug))?.status).toBe('archived');
  });

  it('counts a held question as live, and lets a withdrawn one be left out', async () => {
    const kept = await arrangeLive();
    const held = await arrangeLive();
    const withdrawn = await arrangeLive();
    await bootstrap();
    const record = ['--reason', 'Under review', '--authority', 'Clinical lead'];
    const io = { env: { DATABASE_URL: disposable.url }, log: () => {} };
    await runHoldQuestions(['--qid', held.slug, ...record, '--apply'], io);
    await runContentWithdrawal(
      ['--qid', withdrawn.slug, ...record, '--apply'],
      io,
    );

    await expect(
      stageReleaseFromFiles(disposable.db, [source(kept.slug)]),
    ).rejects.toThrow(`The bundle leaves out live questions: ${held.slug}`);
    await expect(
      stageReleaseFromFiles(disposable.db, [
        source(kept.slug),
        source(held.slug),
      ]),
    ).resolves.toMatchObject({ items: 2, removals: 0 });
  });

  it.each([
    ['in the bundle', true],
    ['not in the active release', false],
  ])('refuses a removal of a question %s', async (_name, inBundle) => {
    const kept = await arrangeLive();
    await bootstrap();
    const other = inBundle ? kept.slug : `it-builder-${randomUUID()}`;

    await expect(
      stageReleaseFromFiles(disposable.db, [source(kept.slug)], {
        remove: [other],
      }),
    ).rejects.toThrow(`Cannot remove ${other}`);
  });

  // Activating a release with no items would archive every question.
  it('refuses a release with no published question', async () => {
    const question = await arrangeLive();
    await bootstrap();

    await expect(
      stageReleaseFromFiles(disposable.db, [
        source(question.slug, { status: 'draft' }),
      ]),
    ).rejects.toThrow(/no published question/);
    expect(await revisionsOf(question.id)).toHaveLength(1);
  });

  it('checks the whole bundle before it writes anything', async () => {
    await bootstrap();
    const valid = `it-builder-${randomUUID()}`;
    const invalid: SeedSourceFile = {
      absolutePath: '/tmp/invalid.mdx',
      raw: '---\nslug: it-builder-invalid\n---\n',
    };

    await expect(
      stageReleaseFromFiles(disposable.db, [source(valid), invalid]),
    ).rejects.toThrow(/invalid\.mdx/);

    expect(await questionBySlug(valid)).toBeUndefined();
  });
});

describe('stage-release command', () => {
  it('previews a stage, applies it and names the activation to run', async () => {
    const question = await arrangeLive();
    const active = await bootstrap();
    const files = [
      source(question.slug, { stem: 'A corrected clinical task.' }),
    ];
    const lines: string[] = [];
    const io = {
      env: { DATABASE_URL: disposable.url },
      log: (line: string) => lines.push(line),
      readFiles: async () => files,
    };

    await runStageRelease([], io);
    expect(lines.join('\n')).toContain('Release staging (dry-run): ');
    expect(
      await disposable.db.select().from(schema.contentReleases),
    ).toHaveLength(1);
    expect(await revisionsOf(question.id)).toHaveLength(1);

    lines.length = 0;
    await runStageRelease(['--apply'], io);
    const output = lines.join('\n');
    const [staged] = await disposable.db
      .select({ id: schema.contentReleases.id })
      .from(schema.contentReleases)
      .where(eq(schema.contentReleases.parentReleaseId, active));
    expect(output).toContain(
      `Release staging: release=${staged?.id} parent=${active}`,
    );
    expect(output).toContain(
      `activate-release.ts --release ${staged?.id} --expect-active ${active}`,
    );
  });

  it('rejects an unknown argument', async () => {
    await expect(
      runStageRelease(['--all'], {
        env: { DATABASE_URL: disposable.url },
        log: () => {},
        readFiles: async () => [],
      }),
    ).rejects.toThrow('Unknown argument: --all');
  });
});
