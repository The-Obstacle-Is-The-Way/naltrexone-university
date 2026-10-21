import { eq } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import * as schema from '@/db/schema';
import {
  compareLiveKeys,
  runCompareLiveKeys,
} from '@/scripts/content-release/compare-live-keys';
import { parseSeedQuestionFile } from '@/scripts/seed/question-parser';
import { appendQuestionRevision } from '@/scripts/seed/question-revision-writer';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { createContentRepository } from '@/tests/shared/content-repository-test-helpers';
import { createDisposableDatabase } from './disposable-database-test-helpers';
import { source } from './seed-test-helpers';

let disposable: Awaited<ReturnType<typeof createDisposableDatabase>>;
let repo: Awaited<ReturnType<typeof createContentRepository>>;
beforeAll(async () => {
  disposable = await createDisposableDatabase();
}, 60_000);
afterAll(async () => {
  await disposable.drop();
});
beforeEach(async () => {
  await disposable.db.delete(schema.questions);
  repo = await createContentRepository();
});
afterEach(async () => {
  await repo.dispose();
});

const compare = (commit: string) =>
  compareLiveKeys(disposable.db, { repository: repo.directory, commit });

// BUG-351: the owner's check before the bootstrap. Live content is written by
// the seed, as production's was; the commit is read as the first release
// after the bootstrap will read it.
describe('live answer keys against a content commit', () => {
  it('finds no difference when live content is that commit', async () => {
    await syncQuestionsFromFiles(disposable.db, [
      source('kept-one'),
      source('kept-two'),
    ]);
    const commit = await repo.commit([source('kept-one'), source('kept-two')]);

    expect(await compare(commit)).toEqual({
      commit,
      liveQuestions: 2,
      commitQuestions: 2,
      missingFromCommit: 0,
      notLive: 0,
      differingKeys: 0,
    });
  });

  it('counts a changed key, a live question the commit lacks, and one not live', async () => {
    await syncQuestionsFromFiles(disposable.db, [
      source('same-key'),
      source('changed-key'),
      source('live-only'),
    ]);
    const commit = await repo.commit([
      source('same-key', { stem: 'An edited stem keeps the key.' }),
      source('changed-key', { correctLabel: 'C' }),
      source('commit-only'),
    ]);

    expect(await compare(commit)).toEqual({
      commit,
      liveQuestions: 3,
      commitQuestions: 3,
      missingFromCommit: 1,
      notLive: 1,
      differingKeys: 1,
    });
  });

  it('compares normalized key text, as the release planner does', async () => {
    await syncQuestionsFromFiles(disposable.db, [source('spaced-key')]);
    // Legacy rows can hold text the seed would normalize today.
    const { db } = disposable;
    const [question] = await db
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(eq(schema.questions.slug, 'spaced-key'));
    if (!question) throw new Error('Expected the seeded question');
    const seeded = parseSeedQuestionFile(source('spaced-key').raw);
    await db.transaction((tx) =>
      appendQuestionRevision(tx, question.id, {
        stemMd: seeded.stem_md,
        explanationMd: seeded.explanation_md,
        referenceMd: seeded.reference_md,
        difficulty: seeded.difficulty,
        choices: seeded.choices.map((choice) => ({
          label: choice.label,
          sortOrder: choice.sort_order,
          textMd: choice.is_correct
            ? `${choice.text_md}  \r\n`
            : choice.text_md,
          isCorrect: choice.is_correct,
          explanationMd: choice.explanation_md,
        })),
      }),
    );
    const commit = await repo.commit([source('spaced-key')]);

    expect(await compare(commit)).toMatchObject({ differingKeys: 0 });
  });

  it('reads only published live questions', async () => {
    await syncQuestionsFromFiles(disposable.db, [
      source('draft-only', { status: 'draft' }),
    ]);
    const commit = await repo.commit([source('kept-one')]);

    expect(await compare(commit)).toMatchObject({
      liveQuestions: 0,
      missingFromCommit: 0,
      notLive: 1,
    });
  });

  it('prints counts and the verified commit, and changes nothing', async () => {
    await syncQuestionsFromFiles(disposable.db, [source('kept-one')]);
    const commit = await repo.commit([source('kept-one')]);
    const { db } = disposable;
    const stored = async () => ({
      questions: await db.select().from(schema.questions),
      revisions: await db.select().from(schema.questionRevisions),
    });
    const before = await stored();
    const lines: string[] = [];

    await runCompareLiveKeys(['--repo', repo.directory, '--commit', commit], {
      env: { DATABASE_URL: disposable.url },
      log: (line) => lines.push(line),
    });

    const output = JSON.parse(lines.at(-1) ?? 'null');
    expect(output).toEqual(await compare(commit));
    const { commit: printed, ...counts } = output;
    expect(printed).toBe(commit);
    expect(
      Object.values(counts).every((value) => typeof value === 'number'),
    ).toBe(true);
    expect(await stored()).toEqual(before);
  });

  it('refuses a short commit ID and unknown arguments before opening a database', async () => {
    const io = { env: {}, log: () => {} };
    await expect(
      runCompareLiveKeys(['--repo', repo.directory, '--commit', 'main'], io),
    ).rejects.toThrow(/full lowercase commit ID/);
    await expect(
      runCompareLiveKeys(['--repo', repo.directory, '--apply'], io),
    ).rejects.toThrow(/Unknown argument/);
  });
});
