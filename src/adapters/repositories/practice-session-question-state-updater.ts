import { and, eq, sql } from 'drizzle-orm';
import { practiceSessionQuestionStates, practiceSessions } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type { PracticeSessionQuestionState } from '@/src/domain/entities';
import type { DrizzleDb } from '../shared/database-types';

const UPDATE_QUESTION_STATE_MAX_RETRIES = 3;

type PracticeSessionQuestionStateRow =
  typeof practiceSessionQuestionStates.$inferSelect;

type QuestionStateSnapshot = {
  row: PracticeSessionQuestionStateRow;
  state: PracticeSessionQuestionState;
  endedAt: Date | null;
};

function toDomainQuestionState(
  row: PracticeSessionQuestionStateRow,
): PracticeSessionQuestionState {
  return {
    questionId: row.questionId,
    markedForReview: row.markedForReview,
    latestSelectedChoiceId: row.latestSelectedChoiceId,
    latestIsCorrect: row.latestIsCorrect,
    latestAnsweredAt: row.latestAnsweredAt ?? null,
    draftSelectedChoiceId: row.draftSelectedChoiceId,
    draftSavedAt: row.draftSavedAt ?? null,
    draftCumulativeMs: row.draftCumulativeMs,
  };
}

async function findSessionStatus(input: {
  db: DrizzleDb;
  sessionId: string;
  userId: string;
}): Promise<{ endedAt: Date | null } | null> {
  return (
    (await input.db.query.practiceSessions.findFirst({
      columns: { endedAt: true },
      where: and(
        eq(practiceSessions.id, input.sessionId),
        eq(practiceSessions.userId, input.userId),
      ),
    })) ?? null
  );
}

async function findQuestionStateSnapshot(input: {
  db: DrizzleDb;
  sessionId: string;
  userId: string;
  questionId: string;
}): Promise<QuestionStateSnapshot> {
  const [joined] = await input.db
    .select({
      state: practiceSessionQuestionStates,
      endedAt: practiceSessions.endedAt,
    })
    .from(practiceSessionQuestionStates)
    .innerJoin(
      practiceSessions,
      eq(practiceSessionQuestionStates.practiceSessionId, practiceSessions.id),
    )
    .where(
      and(
        eq(practiceSessionQuestionStates.practiceSessionId, input.sessionId),
        eq(practiceSessions.userId, input.userId),
        eq(practiceSessionQuestionStates.questionId, input.questionId),
      ),
    )
    .limit(1);

  if (joined) {
    return {
      row: joined.state,
      state: toDomainQuestionState(joined.state),
      endedAt: joined.endedAt ?? null,
    };
  }

  const session = await findSessionStatus(input);
  if (!session) {
    throw new ApplicationError('NOT_FOUND', 'Practice session not found');
  }
  if (session.endedAt) {
    throw new ApplicationError('CONFLICT', 'Practice session already ended');
  }

  throw new ApplicationError(
    'NOT_FOUND',
    'Question is not part of this practice session',
  );
}

function toPersistenceUpdate(state: PracticeSessionQuestionState) {
  return {
    markedForReview: state.markedForReview,
    latestSelectedChoiceId: state.latestSelectedChoiceId,
    latestIsCorrect: state.latestIsCorrect,
    latestAnsweredAt: state.latestAnsweredAt,
    draftSelectedChoiceId: state.draftSelectedChoiceId,
    draftSavedAt: state.draftSavedAt,
    draftCumulativeMs: state.draftCumulativeMs,
  };
}

export async function updatePracticeSessionQuestionState(input: {
  db: DrizzleDb;
  now: () => Date;
  sessionId: string;
  userId: string;
  questionId: string;
  updateFn: (
    current: PracticeSessionQuestionState,
  ) => PracticeSessionQuestionState;
  failureMessage: string;
}): Promise<PracticeSessionQuestionState> {
  for (
    let attempt = 0;
    attempt < UPDATE_QUESTION_STATE_MAX_RETRIES;
    attempt += 1
  ) {
    const existing = await findQuestionStateSnapshot(input);
    if (existing.endedAt) {
      throw new ApplicationError('CONFLICT', 'Practice session already ended');
    }

    const updatedState = input.updateFn(existing.state);
    if (updatedState === existing.state) {
      return existing.state;
    }

    const [updated] = await input.db
      .update(practiceSessionQuestionStates)
      .set({
        ...toPersistenceUpdate(updatedState),
        version: sql`${practiceSessionQuestionStates.version} + 1`,
        updatedAt: input.now(),
      })
      .where(
        and(
          eq(practiceSessionQuestionStates.id, existing.row.id),
          eq(practiceSessionQuestionStates.version, existing.row.version),
          sql`exists (
            select 1
            from ${practiceSessions}
            where ${practiceSessions.id} = ${practiceSessionQuestionStates.practiceSessionId}
              and ${practiceSessions.userId} = ${input.userId}
              and ${practiceSessions.endedAt} is null
          )`,
        ),
      )
      .returning();

    if (updated) {
      return toDomainQuestionState(updated);
    }
  }

  const session = await findSessionStatus(input);
  if (!session) {
    throw new ApplicationError('NOT_FOUND', 'Practice session not found');
  }
  if (session.endedAt) {
    throw new ApplicationError('CONFLICT', 'Practice session already ended');
  }

  await findQuestionStateSnapshot(input);
  throw new ApplicationError('INTERNAL_ERROR', input.failureMessage);
}
