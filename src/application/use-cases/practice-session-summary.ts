import type { PracticeSession } from '@/src/domain/entities';
import {
  computeAccuracy,
  computeSessionDurationSeconds,
  computeSessionStats,
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
  const { answered, correct } = computeSessionStats(session.questionStates);
  const questionCount = session.questionIds.length;

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
