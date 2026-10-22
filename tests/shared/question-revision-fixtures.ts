import type { AppendedQuestionRevision } from '@/scripts/seed/question-revision-writer';

// A new revision's choice id by label, for callers that know its labels.
export function choiceIdByLabel(
  appended: AppendedQuestionRevision,
  label: string,
): string {
  const id = appended.choiceIdsByLabel.get(label);
  if (id === undefined) {
    throw new Error(
      `Revision ${appended.revisionNumber} has no choice ${label}`,
    );
  }
  return id;
}
