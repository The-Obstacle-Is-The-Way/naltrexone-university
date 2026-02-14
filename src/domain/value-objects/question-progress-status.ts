export const AllQuestionProgressStatuses = [
  'unanswered',
  'incorrect',
  'bookmarked',
] as const;

export type QuestionProgressStatus =
  (typeof AllQuestionProgressStatuses)[number];

export function isValidQuestionProgressStatus(
  value: string,
): value is QuestionProgressStatus {
  return AllQuestionProgressStatuses.includes(value as QuestionProgressStatus);
}
