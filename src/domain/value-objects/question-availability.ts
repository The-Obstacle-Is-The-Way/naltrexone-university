import type { QuestionStatus } from './question-status';

/**
 * What a learner is told about a question now (ADR-022 Decision 1). It is
 * derived at read time from the question's status and its overlay, never
 * stored, so a later withdrawal, hold or lift shows at once.
 */
export const AllQuestionAvailabilities = [
  'available',
  'withdrawn',
  'under_review',
  'retired',
] as const;

export type QuestionAvailability = (typeof AllQuestionAvailabilities)[number];

/** A question a learner can no longer practice. */
export type UnavailableQuestionAvailability = Exclude<
  QuestionAvailability,
  'available'
>;

/**
 * The overlay on a question: a withdrawal, permanent and question-wide, and
 * an unlifted hold on any of its revisions.
 */
export type QuestionOverlay = {
  readonly withdrawn: boolean;
  readonly underReview: boolean;
};

export const NO_QUESTION_OVERLAY: QuestionOverlay = {
  withdrawn: false,
  underReview: false,
};

/**
 * A published question is available. One that is not is withdrawn if a
 * withdrawal is recorded, else under review if a hold is unlifted, else
 * retired: the same precedence as activation's eligibility.
 */
export function deriveQuestionAvailability(
  status: QuestionStatus,
  overlay: QuestionOverlay,
): QuestionAvailability {
  if (status === 'published') return 'available';
  if (overlay.withdrawn) return 'withdrawn';
  if (overlay.underReview) return 'under_review';
  return 'retired';
}
