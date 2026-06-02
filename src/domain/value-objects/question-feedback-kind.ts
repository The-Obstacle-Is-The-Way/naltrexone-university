/**
 * Question feedback event kind values.
 */
export const AllQuestionFeedbackKinds = ['rating', 'report'] as const;

export type QuestionFeedbackKind = (typeof AllQuestionFeedbackKinds)[number];

export function isValidQuestionFeedbackKind(
  value: string,
): value is QuestionFeedbackKind {
  return AllQuestionFeedbackKinds.includes(value as QuestionFeedbackKind);
}
