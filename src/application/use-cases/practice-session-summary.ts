import type { QuestionRepository } from '@/src/application/ports/repositories';
import { fetchSessionOwnedQuestionsById } from '@/src/application/shared/fetch-session-owned-questions-by-id';
import {
  createPracticeSessionStateMap,
  requirePracticeSessionQuestionState,
} from '@/src/application/shared/practice-session-state';
import type { PracticeSession } from '@/src/domain/entities';
import {
  computeAccuracy,
  computeSessionDurationSeconds,
  computeSessionScore,
  computeSessionStats,
  countsTowardScore,
} from '@/src/domain/services';
import type { QuestionAvailability } from '@/src/domain/value-objects';

export type PracticeSessionSummary = {
  sessionId: string;
  mode: 'tutor' | 'exam';
  questionCount: number;
  endedAt: string;
  totals: {
    /** Every answered item: activity. */
    answered: number;
    /** Items that count toward the score (ADR-022, as amended). */
    scored: number;
    /** Scored items answered correctly. */
    correct: number;
    /** Correct over scored. */
    accuracy: number;
    durationSeconds: number;
  };
};

export function projectPracticeSessionSummary(
  session: PracticeSession,
  endedAt: Date,
  availabilityByQuestionId: ReadonlyMap<string, QuestionAvailability>,
): PracticeSessionSummary {
  const questionCount = session.questionIds.length;
  const stateByQuestionId = createPracticeSessionStateMap(session);
  const orderedStates = session.questionIds.map((questionId) => {
    return requirePracticeSessionQuestionState({
      sessionId: session.id,
      questionId,
      stateByQuestionId,
    });
  });
  const { answered } = computeSessionStats(orderedStates);
  // ADR-022 Amendment (DEBT-494): an item counts when the learner had a fair
  // chance at it, recorded when the session ended, and its content is not
  // now in doubt. One whose question the read cannot find is in doubt.
  const { scored, correct } = computeSessionScore(orderedStates, (state) =>
    countsTowardScore({
      fairChanceAtEnd: state.fairChanceAtEnd,
      availability: availabilityByQuestionId.get(state.questionId) ?? null,
    }),
  );

  return {
    sessionId: session.id,
    mode: session.mode,
    questionCount,
    endedAt: endedAt.toISOString(),
    totals: {
      answered,
      scored,
      correct,
      accuracy: computeAccuracy(scored, correct),
      durationSeconds: computeSessionDurationSeconds(
        session.startedAt,
        endedAt,
      ),
    },
  };
}

/** Reads each item's availability now, then projects the summary. */
export async function summarizePracticeSession(
  questions: QuestionRepository,
  session: PracticeSession,
  endedAt: Date,
): Promise<PracticeSessionSummary> {
  const questionById = await fetchSessionOwnedQuestionsById(
    questions,
    session.questionStates,
  );
  return projectPracticeSessionSummary(
    session,
    endedAt,
    new Map(
      [...questionById].map(([questionId, question]) => [
        questionId,
        question.availability,
      ]),
    ),
  );
}
