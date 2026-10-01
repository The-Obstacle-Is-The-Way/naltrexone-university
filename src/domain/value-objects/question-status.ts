/**
 * Question publication status.
 */
export const AllQuestionStatuses = ['draft', 'published', 'archived'] as const;

export type QuestionStatus = (typeof AllQuestionStatuses)[number];

export function isValidQuestionStatus(value: string): value is QuestionStatus {
  return AllQuestionStatuses.includes(value as QuestionStatus);
}
