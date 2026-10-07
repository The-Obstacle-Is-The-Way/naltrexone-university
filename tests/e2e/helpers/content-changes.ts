import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import {
  insertQuestion,
  reviseQuestion,
  setQuestionState,
} from '@/tests/shared/question-fixtures';

// DEBT-496: content changes arranged for the E2E user on dedicated questions,
// never the shared seeded bank, and removed afterwards. Deleting a question
// removes its attempts and bookmarks with it.

export type ReviewedAttempt = { slug: string; attemptId: string };

export type AnswerOutcome = 'correct' | 'incorrect';

export type ContentChanges = {
  /** The E2E user answered correctly; the key then moved (ADR-022 Decision 4). */
  keyCorrectedAttempt(): Promise<ReviewedAttempt>;
  /** The E2E user answered; the question was then placed under review. */
  heldAttempt(outcome?: AnswerOutcome): Promise<ReviewedAttempt>;
  /** The E2E user answered; nothing changed since. */
  scoredAttempt(outcome?: AnswerOutcome): Promise<ReviewedAttempt>;
  /** The E2E user bookmarked the question; it was then withdrawn. */
  withdrawnBookmark(): Promise<void>;
  /** Deletes the dedicated questions and closes the connection. */
  dispose(): Promise<void>;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for E2E content-change fixtures.`);
  }
  return value;
}

export async function openContentChanges(): Promise<ContentChanges> {
  const sql = postgres(requireEnv('DATABASE_URL'), { max: 1 });
  const db = drizzle(sql, { schema });
  const questionIds: string[] = [];
  try {
    const email = requireEnv('E2E_CLERK_USER_USERNAME');
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email));
    if (!user) throw new Error('The E2E user has no app user row.');

    const question = async (label: string) => {
      const created = await insertQuestion(db, {
        slug: `e2e-content-change-${label}-${randomUUID()}`,
        status: 'published',
        difficulty: 'easy',
      });
      questionIds.push(created.id);
      return created;
    };
    const answer = async (
      created: Awaited<ReturnType<typeof question>>,
      outcome: AnswerOutcome = 'correct',
    ) => {
      const [row] = await db
        .insert(schema.attempts)
        .values({
          userId: user.id,
          questionId: created.id,
          questionRevisionId: created.revisionId,
          selectedChoiceId:
            outcome === 'correct'
              ? created.correctChoiceId
              : created.incorrectChoiceId,
          isCorrect: outcome === 'correct',
          timeSpentSeconds: 10,
        })
        .returning({ id: schema.attempts.id });
      if (!row) throw new Error('Failed to insert the E2E attempt.');
      return row.id;
    };

    return {
      async keyCorrectedAttempt() {
        const created = await question('key');
        const attemptId = await answer(created);
        await reviseQuestion(db, created, 'key');
        return { slug: created.slug, attemptId };
      },
      async heldAttempt(outcome) {
        const created = await question('held');
        const attemptId = await answer(created, outcome);
        await setQuestionState(db, created, 'under_review');
        return { slug: created.slug, attemptId };
      },
      async scoredAttempt(outcome) {
        const created = await question('scored');
        const attemptId = await answer(created, outcome);
        return { slug: created.slug, attemptId };
      },
      async withdrawnBookmark() {
        const created = await question('bookmark');
        await db
          .insert(schema.bookmarks)
          .values({ userId: user.id, questionId: created.id });
        await setQuestionState(db, created, 'withdrawn');
      },
      async dispose() {
        try {
          if (questionIds.length > 0) {
            await db
              .delete(schema.questions)
              .where(inArray(schema.questions.id, questionIds));
          }
        } finally {
          await sql.end({ timeout: 5 });
        }
      },
    };
  } catch (error) {
    await sql.end({ timeout: 5 });
    throw error;
  }
}
