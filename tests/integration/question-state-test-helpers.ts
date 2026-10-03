import { and, sql as drizzleSql, eq, isNull } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { appendQuestionRevision } from '@/scripts/seed/question-revision-writer';
import { addCurrentRevision, type IntegrationDb } from './helpers';

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
  db: IntegrationDb,
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

// Gives a question a new current revision (ADR-021): with another correct
// choice, so an answer graded on the old one is key-corrected (ADR-022
// Decision 4), or with only its stem reworded, which keeps the key.
// `createQuestion`'s first revision keys B, "Choice B".
export async function reviseQuestion(
  db: IntegrationDb,
  question: { id: string },
  change: 'key' | 'stem',
): Promise<void> {
  if (change === 'key') {
    await addCurrentRevision(db, question.id);
    return;
  }
  await appendQuestionRevision(db, question.id, {
    stemMd: '# Reworded stem',
    explanationMd: '# Explanation',
    referenceMd: null,
    difficulty: 'easy',
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
  });
}
