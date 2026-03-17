import type { PracticeSessionRepository } from '@/src/application/ports/repositories';
import {
  computeSessionStats,
  createDefaultQuestionState,
} from '@/src/domain/services';

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

function getIncompleteSelectedChoiceId(
  session: {
    mode: 'tutor' | 'exam';
    endedAt: Date | null;
  },
  state: {
    latestSelectedChoiceId: string | null;
    draftSelectedChoiceId: string | null;
  },
): string | null {
  return session.mode === 'exam' && session.endedAt === null
    ? (state.draftSelectedChoiceId ?? state.latestSelectedChoiceId)
    : state.latestSelectedChoiceId;
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

    const answeredCount =
      session.mode === 'exam' && session.endedAt === null
        ? session.questionIds.reduce((count, questionId) => {
            const state =
              session.questionStates.find(
                (candidate) => candidate.questionId === questionId,
              ) ?? createDefaultQuestionState(questionId);

            return getIncompleteSelectedChoiceId(session, state) !== null
              ? count + 1
              : count;
          }, 0)
        : computeSessionStats(session.questionStates).answered;

    return {
      sessionId: session.id,
      mode: session.mode,
      answeredCount,
      totalCount: session.questionIds.length,
      startedAt: session.startedAt.toISOString(),
    };
  }
}
