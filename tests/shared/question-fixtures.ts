import { randomUUID } from 'node:crypto';
import { and, sql as drizzleSql, eq, isNull } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { onlyRow } from '@/scripts/seed/only-row';
import {
  appendQuestionRevision,
  choiceIdByLabel,
} from '@/scripts/seed/question-revision-writer';
import type { DrizzleDb } from '@/src/adapters/shared/database-types';

// Question fixtures written as the seed and the content commands write them,
// shared by the integration and end-to-end lanes (DEBT-496).

// A question with its first revision, written in one transaction: published or
// not, keyed B ("Choice B") with A as the distractor.
export async function insertQuestion(
  db: DrizzleDb,
  input: {
    id?: string;
    slug: string;
    status: schema.QuestionStatus;
    difficulty: schema.QuestionDifficulty;
    createdAt?: Date;
    tagIds?: readonly string[];
  },
): Promise<{
  id: string;
  /** Its first revision, current until a test adds another. */
  revisionId: string;
  slug: string;
  correctChoiceId: string;
  incorrectChoiceId: string;
}> {
  const createdAt = input.createdAt ?? new Date();
  const updatedAt = createdAt;

  // ADR-021 phase 3: the question points at its first revision, written in
  // the same transaction; the deferred key is checked at commit.
  const revisionId = randomUUID();
  const questionValues: typeof schema.questions.$inferInsert = {
    slug: input.slug,
    status: input.status,
    currentRevisionId: revisionId,
    createdAt,
    updatedAt,
  };

  if (input.id) {
    questionValues.id = input.id;
  }

  const { question, appended } = await db.transaction(async (tx) => {
    const inserted = onlyRow(
      await tx
        .insert(schema.questions)
        .values(questionValues)
        .returning({ id: schema.questions.id }),
      'Failed to insert question',
    );
    // ADR-021: revision 1, written as the seed writes it.
    const revision = await appendQuestionRevision(
      tx,
      inserted.id,
      {
        stemMd: '# Stem',
        explanationMd: '# Explanation',
        referenceMd: null,
        difficulty: input.difficulty,
        choices: [
          {
            label: 'A',
            textMd: 'Choice A',
            isCorrect: false,
            explanationMd: null,
            sortOrder: 1,
          },
          {
            label: 'B',
            textMd: 'Choice B',
            isCorrect: true,
            explanationMd: null,
            sortOrder: 2,
          },
        ],
      },
      { revisionId, updatedAt },
    );
    // In the transaction: a failed link leaves no question behind.
    if (input.tagIds && input.tagIds.length > 0) {
      await tx.insert(schema.questionTags).values(
        input.tagIds.map((tagId) => ({
          questionId: inserted.id,
          tagId,
        })),
      );
    }
    return { question: inserted, appended: revision };
  });

  const correctChoiceId = choiceIdByLabel(appended, 'B');
  const incorrectChoiceId = choiceIdByLabel(appended, 'A');

  return {
    id: question.id,
    revisionId,
    slug: input.slug,
    correctChoiceId,
    incorrectChoiceId,
  };
}

// ADR-021 phase 2b: a second revision with its own choices, made current, as
// the seed appends it. Choice C is correct and D is not; the stem and
// difficulty change too.
export async function addCurrentRevision(
  db: DrizzleDb,
  questionId: string,
): Promise<{
  revisionId: string;
  correctChoiceId: string;
  incorrectChoiceId: string;
}> {
  const appended = await appendQuestionRevision(db, questionId, {
    stemMd: '# Revised stem',
    explanationMd: '# Revised explanation',
    referenceMd: 'Revised reference',
    difficulty: 'hard',
    choices: [
      {
        label: 'C',
        textMd: 'Revised C',
        isCorrect: true,
        explanationMd: null,
        sortOrder: 3,
      },
      {
        label: 'D',
        textMd: 'Revised D',
        isCorrect: false,
        explanationMd: null,
        sortOrder: 4,
      },
    ],
  });
  return {
    revisionId: appended.revisionId,
    correctChoiceId: choiceIdByLabel(appended, 'C'),
    incorrectChoiceId: choiceIdByLabel(appended, 'D'),
  };
}

export type QuestionStateNow =
  | 'available'
  | 'retired'
  | 'withdrawn'
  | 'under_review';

const DECISION = { reason: 'Integration test', authority: 'Test suite' };

// Puts a question in a learner-facing state the way the content commands
// leave it (ADR-022 Decision 1): published; archived alone (retired);
// archived with a withdrawal; or archived with an unlifted hold on its
// revision. Moving to available lifts any unlifted hold.
export async function setQuestionState(
  db: DrizzleDb,
  question: { id: string; revisionId: string },
  state: QuestionStateNow,
): Promise<void> {
  await db
    .update(schema.questions)
    .set({ status: state === 'available' ? 'published' : 'archived' })
    .where(eq(schema.questions.id, question.id));
  if (state === 'withdrawn') {
    await db.insert(schema.questionWithdrawals).values({
      questionId: question.id,
      questionRevisionId: question.revisionId,
      ...DECISION,
    });
  }
  if (state === 'under_review') {
    await db.insert(schema.questionHolds).values({
      questionId: question.id,
      questionRevisionId: question.revisionId,
      ...DECISION,
    });
  }
  if (state === 'available') {
    await db
      .update(schema.questionHolds)
      .set({
        // From the row: a client time can sort before placed_at (#1336).
        liftedAt: drizzleSql`${schema.questionHolds.placedAt} + interval '1 second'`,
        liftReason: 'Integration test lift',
        liftAuthority: 'Test suite',
      })
      .where(
        and(
          eq(schema.questionHolds.questionId, question.id),
          isNull(schema.questionHolds.liftedAt),
        ),
      );
  }
}

export type QuestionRevisionChange = 'key' | 'key text' | 'stem' | 'distractor';

// Gives a question a new current revision (ADR-021). `createQuestion`'s first
// revision keys B, "Choice B". A change of key (another correct choice, or the
// correct choice reworded) makes an answer graded on the old revision
// key-corrected (ADR-022 Decision 4); a reworded stem or distractor keeps it.
export async function reviseQuestion(
  db: DrizzleDb,
  question: { id: string },
  change: QuestionRevisionChange,
): Promise<void> {
  if (change === 'key') {
    await addCurrentRevision(db, question.id);
    return;
  }
  await appendQuestionRevision(db, question.id, {
    stemMd: change === 'stem' ? '# Reworded stem' : '# Stem',
    explanationMd: '# Explanation',
    referenceMd: null,
    difficulty: 'easy',
    choices: [
      {
        label: 'A',
        textMd: change === 'distractor' ? 'Choice A, reworded' : 'Choice A',
        isCorrect: false,
        explanationMd: null,
        sortOrder: 1,
      },
      {
        label: 'B',
        textMd: change === 'key text' ? 'Choice B, reworded' : 'Choice B',
        isCorrect: true,
        explanationMd: null,
        sortOrder: 2,
      },
    ],
  });
}
