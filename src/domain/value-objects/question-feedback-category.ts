/**
 * Question feedback report category values.
 */
export const AllQuestionFeedbackCategories = [
  'incorrect_answer',
  'ambiguous_wording',
  'typo_formatting',
  'outdated_reference',
  'other',
] as const;

export type QuestionFeedbackCategory =
  (typeof AllQuestionFeedbackCategories)[number];

export function isValidQuestionFeedbackCategory(
  value: string,
): value is QuestionFeedbackCategory {
  return AllQuestionFeedbackCategories.includes(
    value as QuestionFeedbackCategory,
  );
}
