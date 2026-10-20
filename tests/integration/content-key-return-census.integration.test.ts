import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import type { QuestionRevisionFields } from '@/lib/content/question-revision-hash';
import {
  readKeyReturnCensus,
  runKeyReturnCensus,
} from '@/scripts/content-release/census-key-returns';
import { appendQuestionRevision } from '@/scripts/seed/question-revision-writer';
import { createDisposableDatabase } from './disposable-database-test-helpers';
import { createCleanupState, createQuestion } from './helpers';

let disposable: Awaited<ReturnType<typeof createDisposableDatabase>>;
beforeAll(async () => {
  disposable = await createDisposableDatabase();
}, 60_000);
afterAll(async () => {
  await disposable.drop();
});
beforeEach(async () => {
  await disposable.db.delete(schema.questions);
});

// The fixture question's first revision is keyed B, "Choice B".
function keyed(
  correct: readonly { label: 'A' | 'B'; text: string }[],
): QuestionRevisionFields {
  const textOf = (label: 'A' | 'B') =>
    correct.find((choice) => choice.label === label)?.text ?? `Choice ${label}`;
  return {
    stemMd: 'Synthetic stem',
    explanationMd: 'Synthetic explanation',
    referenceMd: null,
    difficulty: 'easy',
    choices: (['A', 'B'] as const).map((label, index) => ({
      label,
      sortOrder: index + 1,
      textMd: textOf(label),
      isCorrect: correct.some((choice) => choice.label === label),
      explanationMd: null,
    })),
  };
}

async function questionWith(
  status: schema.QuestionStatus,
  revisions: readonly QuestionRevisionFields[],
) {
  const { db } = disposable;
  const question = await createQuestion(db, createCleanupState(), {
    slug: `it-key-return-${randomUUID()}`,
    status,
    difficulty: 'easy',
  });
  await db.transaction(async (tx) => {
    for (const revision of revisions)
      await appendQuestionRevision(tx, question.id, revision);
  });
}

const none = {
  candidateRevisions: 0,
  questions: 0,
  publishedCurrentCandidates: 0,
  attemptsBound: 0,
  answeredAttemptsBound: 0,
  malformedKeyRevisions: 0,
};

describe('read-only key-return census', () => {
  it('finds a corrected key that returns', async () => {
    await questionWith('published', [
      keyed([{ label: 'B', text: 'Corrected key' }]),
      keyed([{ label: 'B', text: 'Choice B' }]),
    ]);

    expect(await readKeyReturnCensus(disposable.db)).toEqual({
      ...none,
      candidateRevisions: 1,
      questions: 1,
      publishedCurrentCandidates: 1,
    });
  });

  it('finds a returning key whose stored text differs only in spacing', async () => {
    await questionWith('published', [
      keyed([{ label: 'B', text: 'Legacy key \r\n' }]),
      keyed([{ label: 'B', text: 'Corrected key' }]),
      keyed([{ label: 'B', text: 'Legacy key' }]),
    ]);

    expect(await readKeyReturnCensus(disposable.db)).toMatchObject({
      candidateRevisions: 1,
      questions: 1,
    });
  });

  it('does not count a spacing-only change, or its reversal, as a key change', async () => {
    await questionWith('published', [
      keyed([{ label: 'B', text: 'Choice B  ' }]),
      keyed([{ label: 'B', text: 'Choice B' }]),
    ]);

    expect(await readKeyReturnCensus(disposable.db)).toEqual(none);
  });

  it('counts a correct answer that moves back to its earlier label', async () => {
    await questionWith('draft', [
      keyed([{ label: 'A', text: 'Choice B' }]),
      keyed([{ label: 'B', text: 'Choice B' }]),
    ]);

    expect(await readKeyReturnCensus(disposable.db)).toEqual({
      ...none,
      candidateRevisions: 1,
      questions: 1,
    });
  });

  it('counts revisions without exactly one correct choice apart', async () => {
    await questionWith('published', [
      keyed([
        { label: 'A', text: 'Choice A' },
        { label: 'B', text: 'Choice B' },
      ]),
    ]);

    expect(await readKeyReturnCensus(disposable.db)).toEqual({
      ...none,
      malformedKeyRevisions: 1,
    });
  });

  it('prints only counts and changes nothing', async () => {
    await questionWith('published', [
      keyed([{ label: 'B', text: 'Corrected key' }]),
      keyed([{ label: 'B', text: 'Choice B' }]),
    ]);
    const { db } = disposable;
    const stored = async () => ({
      revisions: await db.select().from(schema.questionRevisions),
      choices: await db.select().from(schema.choices),
      questions: await db.select().from(schema.questions),
    });
    const before = await stored();
    const lines: string[] = [];

    await runKeyReturnCensus([], {
      env: { DATABASE_URL: disposable.url },
      log: (line) => lines.push(line),
    });

    const output = JSON.parse(lines.at(-1) ?? 'null');
    expect(output).toEqual(await readKeyReturnCensus(db));
    expect(
      Object.values(output).every((value) => typeof value === 'number'),
    ).toBe(true);
    expect(await stored()).toEqual(before);
  });

  it('refuses arguments before opening a database', async () => {
    await expect(
      runKeyReturnCensus(['--apply'], { env: {}, log: () => {} }),
    ).rejects.toThrow('This census takes no arguments');
  });
});
