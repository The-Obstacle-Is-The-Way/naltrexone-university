import { and, eq, isNull } from 'drizzle-orm';
import { practiceSessions } from '@/db/schema';
import { ApplicationError } from '@/src/application/errors';
import type {
  PracticeSession,
  PracticeSessionQuestionState,
} from '@/src/domain/entities';
import type { DrizzleDb } from '../shared/database-types';
import { toPracticeSessionParamsJson } from './practice-session-params';

const UPDATE_QUESTION_STATE_MAX_RETRIES = 3;

export async function updatePracticeSessionQuestionState(input: {
  db: DrizzleDb;
  findByIdAndUserId: (
    id: string,
    userId: string,
  ) => Promise<PracticeSession | null>;
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
    const existing = await input.findByIdAndUserId(
      input.sessionId,
      input.userId,
    );
    if (!existing) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }
    if (existing.endedAt) {
      throw new ApplicationError('CONFLICT', 'Practice session already ended');
    }

    const found = existing.questionStates.find(
      (state) => state.questionId === input.questionId,
    );
    if (!found) {
      throw new ApplicationError(
        'NOT_FOUND',
        'Question is not part of this practice session',
      );
    }

    const updatedState = input.updateFn(found);
    const nextSession: PracticeSession = {
      ...existing,
      questionStates: existing.questionStates.map((state) =>
        state.questionId === input.questionId ? updatedState : state,
      ),
    };
    const expectedParamsJson = toPracticeSessionParamsJson(existing);
    const nextParamsJson = toPracticeSessionParamsJson(nextSession);

    const [updated] = await input.db
      .update(practiceSessions)
      .set({ paramsJson: nextParamsJson })
      .where(
        and(
          eq(practiceSessions.id, input.sessionId),
          eq(practiceSessions.userId, input.userId),
          isNull(practiceSessions.endedAt),
          eq(practiceSessions.paramsJson, expectedParamsJson),
        ),
      )
      .returning({ id: practiceSessions.id });

    if (updated) {
      return updatedState;
    }
  }

  const current = await input.findByIdAndUserId(input.sessionId, input.userId);
  if (!current) {
    throw new ApplicationError('NOT_FOUND', 'Practice session not found');
  }
  if (current.endedAt) {
    throw new ApplicationError('CONFLICT', 'Practice session already ended');
  }

  throw new ApplicationError('INTERNAL_ERROR', input.failureMessage);
}
