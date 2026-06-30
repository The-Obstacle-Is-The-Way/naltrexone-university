import { and, eq, sql } from 'drizzle-orm';
import { practiceSessionQuestionStates, practiceSessions } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type { PracticeSessionQuestionState } from '@/src/domain/entities';
import type { DrizzleDb } from '../shared/database-types';
import { parsePracticeSessionParamsJson } from './practice-session-params';

const UPDATE_QUESTION_STATE_MAX_RETRIES = 3;

type PracticeSessionQuestionStateRow =
  typeof practiceSessionQuestionStates.$inferSelect;

type QuestionStateSnapshot = {
  row: PracticeSessionQuestionStateRow;
  state: PracticeSessionQuestionState;
  endedAt: Date | null;
};

type SessionStatus = {
  endedAt: Date | null;
  paramsJson: unknown;
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

async function lockSessionStatus(input: {
  db: DrizzleDb;
  sessionId: string;
  userId: string;
}): Promise<SessionStatus | null> {
  const [row] = await input.db
    .select({
      endedAt: practiceSessions.endedAt,
      paramsJson: practiceSessions.paramsJson,
    })
    .from(practiceSessions)
    .where(
      and(
        eq(practiceSessions.id, input.sessionId),
        eq(practiceSessions.userId, input.userId),
      ),
    )
    .for('update');

  return row
    ? { endedAt: row.endedAt ?? null, paramsJson: row.paramsJson }
    : null;
}

async function findQuestionStateRow(input: {
  db: DrizzleDb;
  sessionId: string;
  questionId: string;
}): Promise<PracticeSessionQuestionStateRow | null> {
  const [row] = await input.db
    .select()
    .from(practiceSessionQuestionStates)
    .where(
      and(
        eq(practiceSessionQuestionStates.practiceSessionId, input.sessionId),
        eq(practiceSessionQuestionStates.questionId, input.questionId),
      ),
    )
    .limit(1);

  return row ?? null;
}

async function findQuestionStateSnapshot(input: {
  db: DrizzleDb;
  sessionId: string;
  userId: string;
  questionId: string;
}): Promise<QuestionStateSnapshot> {
  const session = await lockSessionStatus(input);
  if (!session) {
    throw new ApplicationError('NOT_FOUND', 'Practice session not found');
  }

  const row = await findQuestionStateRow(input);
  if (row) {
    return {
      row,
      state: toDomainQuestionState(row),
      endedAt: session.endedAt,
    };
  }

  if (session.endedAt) {
    throw new ApplicationError('CONFLICT', 'Practice session already ended');
  }

  const params = parsePracticeSessionParamsJson(
    session.paramsJson,
    'INTERNAL_ERROR',
  );
  if (params.questionIds.includes(input.questionId)) {
    throw new ApplicationError(
      'INTERNAL_ERROR',
      `Practice session ${input.sessionId} is missing normalized question state`,
    );
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
    const attemptResult = await input.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;
      const existing = await findQuestionStateSnapshot({
        ...input,
        db: txDb,
      });
      if (existing.endedAt) {
        throw new ApplicationError(
          'CONFLICT',
          'Practice session already ended',
        );
      }

      const updatedState = input.updateFn(existing.state);
      if (updatedState === existing.state) {
        return { status: 'updated' as const, state: existing.state };
      }

      const [updated] = await txDb
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

      return updated
        ? { status: 'updated' as const, state: toDomainQuestionState(updated) }
        : { status: 'stale' as const };
    });

    if (attemptResult.status === 'updated') {
      return attemptResult.state;
    }
  }

  const finalSnapshot = await input.db.transaction(async (tx) =>
    findQuestionStateSnapshot({
      ...input,
      db: tx as unknown as DrizzleDb,
    }),
  );
  if (finalSnapshot.endedAt) {
    throw new ApplicationError('CONFLICT', 'Practice session already ended');
  }
  throw new ApplicationError('INTERNAL_ERROR', input.failureMessage);
}
