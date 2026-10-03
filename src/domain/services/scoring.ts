import type { PracticeSessionQuestionState } from '../entities';
import type { PracticeMode, QuestionAvailability } from '../value-objects';

/**
 * ADR-022 Decision 3: an item counts toward a score only while its question
 * is available. A question that no longer exists does not count either.
 * DEBT-493 increment 4 adds the second condition: if the item was answered,
 * the key it was graded against is still the current key.
 */
export function countsTowardScore(
  availability: QuestionAvailability | null,
): boolean {
  return availability === 'available';
}

export type SessionScore = {
  /** The items that count toward the score. */
  scored: number;
  /** The scored items answered correctly. */
  correct: number;
};

/**
 * A session's score over the items that count. An item that does not count
 * leaves both the numerator and the denominator; an unanswered or omitted
 * item that counts is scored as incorrect.
 */
export function computeSessionScore(
  questionStates: readonly PracticeSessionQuestionState[],
  counts: (state: PracticeSessionQuestionState) => boolean,
): SessionScore {
  const scored = questionStates.filter(counts);
  return {
    scored: scored.length,
    correct: scored.filter(
      (state) =>
        state.latestSelectedChoiceId !== null && state.latestIsCorrect === true,
    ).length,
  };
}

/**
 * ADR-022 Amendment (DEBT-494): whether the learner had a fair chance at a
 * session item, recorded when its session ends, since it cannot be rebuilt
 * later. Its question was available then, or, in tutor mode, the learner had
 * already answered it: a tutor answer is graded when given, on content then
 * available. An exam draft is final only at submission.
 */
export function hadFairChanceAtEnd(input: {
  mode: PracticeMode;
  answered: boolean;
  availability: QuestionAvailability | null;
}): boolean {
  return (
    input.availability === 'available' ||
    (input.mode === 'tutor' && input.answered)
  );
}
