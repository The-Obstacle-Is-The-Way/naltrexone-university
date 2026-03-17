import type { PracticeSession } from '@/src/domain/entities';
import {
  computeAccuracy,
  computeSessionDurationSeconds,
  computeSessionStats,
  createDefaultQuestionState,
} from '@/src/domain/services';

export type PracticeSessionSummary = {
  sessionId: string;
  mode: 'tutor' | 'exam';
  questionCount: number;
  endedAt: string;
  totals: {
    answered: number;
    correct: number;
    accuracy: number;
    durationSeconds: number;
  };
};

export function projectPracticeSessionSummary(
  session: PracticeSession,
  endedAt: Date,
): PracticeSessionSummary {
  const questionCount = session.questionIds.length;
  const stateByQuestionId = new Map(
    session.questionStates.map((state) => [state.questionId, state]),
  );
  const orderedStates = session.questionIds.map((questionId) => {
    return (
      stateByQuestionId.get(questionId) ??
      createDefaultQuestionState(questionId)
    );
  });
  const { answered, correct } = computeSessionStats(orderedStates);

  return {
    sessionId: session.id,
    mode: session.mode,
    questionCount,
    endedAt: endedAt.toISOString(),
    totals: {
      answered,
      correct,
      accuracy: computeAccuracy(questionCount, correct),
      durationSeconds: computeSessionDurationSeconds(
        session.startedAt,
        endedAt,
      ),
    },
  };
}
