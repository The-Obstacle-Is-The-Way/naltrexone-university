/**
 * Question feedback rating values.
 */
export const AllQuestionFeedbackRatings = ['helpful', 'not_helpful'] as const;

export type QuestionFeedbackRating =
  (typeof AllQuestionFeedbackRatings)[number];

export function isValidQuestionFeedbackRating(
  value: string,
): value is QuestionFeedbackRating {
  return AllQuestionFeedbackRatings.includes(value as QuestionFeedbackRating);
}
