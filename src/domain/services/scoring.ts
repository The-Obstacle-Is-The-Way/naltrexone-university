import type { PracticeSessionQuestionState } from '../entities';
import type { PracticeMode, QuestionAvailability } from '../value-objects';

/**
 * ADR-022 Amendment (DEBT-494): content the bank no longer stands behind:
 * withdrawn or under review. DEBT-493 increment 4 adds an answered item whose
 * graded key was since corrected. Retirement is curation, not doubt. A
 * question that no longer exists is in doubt too.
 */
export function contentInDoubt(
  availability: QuestionAvailability | null,
): boolean {
  return (
    availability === null ||
    availability === 'withdrawn' ||
    availability === 'under_review'
  );
}

/**
 * ADR-022 Amendment (DEBT-494): an item counts toward a score when the
 * learner had a fair chance at it, recorded when its session ends, and its
 * content is not now in doubt. A fair chance never recorded (an attempt
 * outside a session, or a session ended in the deploy window before the
 * record was written) is a fair chance.
 */
export function countsTowardScore(input: {
  fairChanceAtEnd: boolean | null;
  availability: QuestionAvailability | null;
  /**
   * The item was answered, and the key it was graded against was since
   * corrected (ADR-022 Decision 4). An unanswered item's key never matters.
   */
  keyCorrected?: boolean;
}): boolean {
  return (
    input.fairChanceAtEnd !== false &&
    !contentInDoubt(input.availability) &&
    input.keyCorrected !== true
  );
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

/**
 * An active session's item, as it would count if the session ended now
 * (ADR-022 Decision 5, as amended): the fair chance its end would record, and
 * its content not in doubt. Review & Submit and the active notice use it.
 */
export function countsIfEndedNow(input: {
  mode: PracticeMode;
  answered: boolean;
  availability: QuestionAvailability | null;
}): boolean {
  return countsTowardScore({
    fairChanceAtEnd: hadFairChanceAtEnd(input),
    availability: input.availability,
  });
}
