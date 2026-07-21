import type { PracticeSessionRepository } from '@/src/application/ports/repositories';
import {
  createPracticeSessionStateMap,
  getEffectiveSelectedChoiceId,
  requirePracticeSessionQuestionState,
} from '@/src/application/shared/practice-session-state';
import type { PracticeSession } from '@/src/domain/entities';

export type GetIncompletePracticeSessionInput = {
  userId: string;
};

export type GetIncompletePracticeSessionOutput = {
  sessionId: string;
  mode: 'tutor' | 'exam';
  answeredCount: number;
  totalCount: number;
  startedAt: string;
} | null;

function countIncompleteAnsweredQuestions(session: PracticeSession): number {
  const stateByQuestionId = createPracticeSessionStateMap(session);
  return session.questionIds.reduce((count, questionId) => {
    const state = requirePracticeSessionQuestionState({
      sessionId: session.id,
      questionId,
      stateByQuestionId,
    });

    return getEffectiveSelectedChoiceId(session, state) !== null
      ? count + 1
      : count;
  }, 0);
}

export class GetIncompletePracticeSessionUseCase {
  constructor(private readonly sessions: PracticeSessionRepository) {}

  async execute(
    input: GetIncompletePracticeSessionInput,
  ): Promise<GetIncompletePracticeSessionOutput> {
    const session = await this.sessions.findLatestIncompleteByUserId(
      input.userId,
    );
    if (!session) return null;

    const answeredCount = countIncompleteAnsweredQuestions(session);

    return {
      sessionId: session.id,
      mode: session.mode,
      answeredCount,
      totalCount: session.questionIds.length,
      startedAt: session.startedAt.toISOString(),
    };
  }
}
