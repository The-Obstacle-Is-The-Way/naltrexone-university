import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import type { QuestionRevisionFields } from '@/lib/content/question-revision-hash';
import {
  readNormalizationCensus,
  runNormalizationCensus,
} from '@/scripts/content-release/census-normalization';
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

const canonical: QuestionRevisionFields = {
  stemMd: 'Synthetic stem',
  explanationMd: 'Synthetic explanation',
  referenceMd: null,
  difficulty: 'easy',
  choices: [
    {
      label: 'A',
      sortOrder: 1,
      textMd: 'Synthetic key',
      isCorrect: true,
      explanationMd: null,
    },
    {
      label: 'B',
      sortOrder: 2,
      textMd: 'Synthetic distractor',
      isCorrect: false,
      explanationMd: null,
    },
  ],
};

describe('read-only content normalization census', () => {
  it('reports zero counts for an empty database', async () => {
    expect(Object.values(await readNormalizationCensus(disposable.db))).toEqual(
      Array(10).fill(0),
    );
  });

  it('counts each noncanonical field and the correct-choice subset without rewriting stored fields or hashes', async () => {
    const { db } = disposable;
    const question = await createQuestion(db, createCleanupState(), {
      slug: `it-census-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });
    const baseline = await readNormalizationCensus(db);
    await db.transaction(async (tx) => {
      await appendQuestionRevision(tx, question.id, {
        ...canonical,
        stemMd: '\u00a0Synthetic stem\r\n ',
        explanationMd: 'Synthetic explanation\t ',
        referenceMd: ' \r\n ',
        choices: canonical.choices.map((choice) =>
          choice.isCorrect
            ? {
                ...choice,
                textMd: '\ufeffSynthetic key \r\n',
                explanationMd: '\t ',
              }
            : choice,
        ),
      });
      await appendQuestionRevision(tx, question.id, {
        ...canonical,
        referenceMd: '',
        choices: canonical.choices.map((choice) =>
          choice.isCorrect ? { ...choice, explanationMd: '' } : choice,
        ),
      });
    });
    const stored = async () => ({
      revisions: await db.select().from(schema.questionRevisions),
      choices: await db.select().from(schema.choices),
    });
    const before = await stored();

    const counts = await readNormalizationCensus(db);

    expect(counts).toEqual({
      revisions: baseline.revisions + 2,
      choices: baseline.choices + 4,
      noncanonicalRevisions: 2,
      stems: 1,
      explanations: 1,
      references: 2,
      choiceTexts: 1,
      choiceExplanations: 2,
      correctChoiceTexts: 1,
      revisionsWithCorrectChoiceTextChanges: 1,
    });
    expect(await stored()).toEqual(before);
    const lines: string[] = [];
    await runNormalizationCensus([], {
      env: { DATABASE_URL: disposable.url },
      log: (line) => lines.push(line),
    });
    const output = JSON.parse(lines.at(-1) ?? 'null');
    expect(output).toEqual(counts);
    expect(
      Object.values(output).every((value) => typeof value === 'number'),
    ).toBe(true);
    expect(await stored()).toEqual(before);
  });

  it('refuses mutation flags before opening a database', async () => {
    await expect(
      runNormalizationCensus(['--apply'], { env: {}, log: () => {} }),
    ).rejects.toThrow('This census takes no arguments');
  });
});
